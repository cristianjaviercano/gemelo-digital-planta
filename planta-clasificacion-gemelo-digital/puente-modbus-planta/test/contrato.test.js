// Pruebas unitarias de las piezas puras: configuración (.env) y contrato de datos.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarConfig } from '../src/config/env.js';
import { construirEstado, systemStatusDe, validarComando, crearAck } from '../src/models/dataContract.js';

const ENV_VALIDO = {
  MODBUS_HOST: '127.0.0.1', MODBUS_PORT: '5020', MODBUS_UNIT_ID: '1', MODBUS_TIMEOUT_MS: '2000',
  POLL_INTERVAL_MS: '50', HEARTBEAT_STALE_MS: '1500', PULSE_WIDTH_MS: '150',
  RECONNECT_BASE_MS: '500', RECONNECT_MAX_MS: '5000', WS_PORT: '8080',
};

describe('Configuración (.env)', () => {
  test('carga los valores y aplica WS_HOST y LOG_LEVEL por defecto', () => {
    const config = cargarConfig(ENV_VALIDO);
    assert.equal(config.modbus.port, 5020);
    assert.equal(config.ws.host, '127.0.0.1');
    assert.equal(config.logLevel, 'info');
    assert.ok(Object.isFrozen(config) && Object.isFrozen(config.modbus));
  });

  test('rechaza valores ausentes o fuera de rango con un mensaje claro', () => {
    assert.throws(() => cargarConfig({ ...ENV_VALIDO, MODBUS_PORT: undefined }), /falta MODBUS_PORT/);
    assert.throws(() => cargarConfig({ ...ENV_VALIDO, MODBUS_PORT: '70000' }), /MODBUS_PORT=70000/);
    assert.throws(() => cargarConfig({ ...ENV_VALIDO, LOG_LEVEL: 'mucho' }), /LOG_LEVEL/);
  });

  test('exige pulsos más largos que el ciclo de lectura (H2)', () => {
    assert.throws(() => cargarConfig({ ...ENV_VALIDO, PULSE_WIDTH_MS: '40' }), /PULSE_WIDTH_MS/);
  });
});

describe('Contrato de datos v1.1.0', () => {
  test('λ⁻¹ traduce las seis palabras válidas, ignora el heartbeat y marca el resto como indeterminado', () => {
    // Discrete inputs 0..6: q0 q1 q2 q3 q4 heartbeat q6
    const casos = {
      REPOSO: [0, 0, 0, 0, 0, 1, 0],
      ESPERANDO_PAQUETE: [1, 0, 0, 0, 0, 0, 0],
      CLASIFICANDO_RUTA_A: [1, 0, 1, 0, 0, 0, 0],
      CLASIFICANDO_RUTA_B: [1, 1, 0, 1, 0, 0, 0],
      PARADA_EMERGENCIA: [0, 0, 0, 0, 1, 0, 0],
      ESPERANDO_CAMBIO_ESTIBA: [0, 0, 0, 0, 0, 0, 1],
      ESTADO_INDETERMINADO: [1, 0, 1, 1, 0, 0, 0],   // salida A y B a la vez: viola P2
    };
    for (const [esperado, bits] of Object.entries(casos)) {
      assert.equal(systemStatusDe(bits.map(Boolean)), esperado);
    }
  });

  test('el estado con PLC vivo refleja los bits y es inmutable', () => {
    const estado = construirEstado({
      plcVivo: true,
      coils: [false, false, false, true, true, false, true],
      discreteInputs: [true, true, false, true, false, true, false],
      timestamp: 1,
    });
    assert.equal(estado.systemStatus, 'CLASIFICANDO_RUTA_B');
    assert.equal(estado.heartbeat, true);
    assert.equal(estado.inputs.selectorDestinoB, true);
    assert.equal(estado.inputs.estibaLlenaB, true);
    assert.equal(estado.outputs.desviadorActivo, true);
    assert.equal(estado.outputs.senalCambioEstiba, false);
    assert.ok(Object.isFrozen(estado) && Object.isFrozen(estado.outputs));
    assert.deepEqual(Object.keys(estado), ['timestamp', 'plcConnected', 'heartbeat', 'inputs', 'outputs', 'systemStatus']);
    assert.deepEqual(Object.keys(estado.outputs),
      ['cintaEntrada', 'desviadorActivo', 'cintaSalidaA', 'cintaSalidaB', 'balizaAlarma', 'senalCambioEstiba']);
  });

  test('sin PLC aplica la degradación segura: todo en false y SIN_CONEXION_PLC', () => {
    const estado = construirEstado({ plcVivo: false, discreteInputs: [true, true, true, true, true, true] });
    assert.equal(estado.plcConnected, false);
    assert.equal(estado.systemStatus, 'SIN_CONEXION_PLC');
    assert.ok(Object.values(estado.outputs).every((v) => v === false));
  });

  test('la lista blanca acepta solo los siete comandos del contrato', () => {
    const ok = validarComando('{"type":"command","target":"emergencia","action":"set","value":true}');
    assert.deepEqual(ok.comando, { target: 'emergencia', coil: 2, accion: 'set', valor: true });
    const estiba = validarComando('{"type":"command","target":"estibaLlenaB","action":"set","value":true}');
    assert.deepEqual(estiba.comando, { target: 'estibaLlenaB', coil: 6, accion: 'set', valor: true });
    assert.equal(validarComando('{"type":"command","target":"estibaLlenaA","action":"pulse"}').error, 'ACCION_NO_PERMITIDA');

    const rechazos = {
      'no es json': 'JSON_INVALIDO',
      '{"type":"saludo"}': 'TIPO_NO_SOPORTADO',
      '{"type":"command","target":"motor","action":"set","value":true}': 'TARGET_NO_PERMITIDO',
      '{"type":"command","target":"__proto__","action":"set","value":true}': 'TARGET_NO_PERMITIDO',
      '{"type":"command","target":"marcha","action":"set","value":true}': 'ACCION_NO_PERMITIDA',
      '{"type":"command","target":"selectorDestinoB","action":"set","value":"B"}': 'VALOR_INVALIDO',
    };
    for (const [texto, error] of Object.entries(rechazos)) {
      assert.equal(validarComando(texto).error, error, texto);
    }
  });

  test('el ack incluye el código de error solo cuando falla', () => {
    assert.deepEqual(crearAck('marcha', true), { type: 'ack', target: 'marcha', ok: true });
    assert.deepEqual(crearAck('marcha', false, 'PLC_DESCONECTADO'),
      { type: 'ack', target: 'marcha', ok: false, error: 'PLC_DESCONECTADO' });
  });
});
