// Integración del middleware contra el PLC virtual (Contrato v1.2.0): una HMI de
// prueba habla por WebSocket y verifica las 4 tablas Modbus, el heartbeat y la reconexión.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as esperar } from 'node:timers/promises';
import pino from 'pino';
import WebSocket from 'ws';
import { PlcVirtual } from '../../plc-virtual/src/plcVirtual.js';
import { cargarConfig } from '../src/config/env.js';
import { iniciarPuente } from '../src/index.js';

const PUERTO_PLC = 15021;
const config = cargarConfig({
  MODBUS_HOST: '127.0.0.1', MODBUS_PORT: String(PUERTO_PLC), MODBUS_UNIT_ID: '1', MODBUS_TIMEOUT_MS: '2000',
  POLL_INTERVAL_MS: '50', HEARTBEAT_STALE_MS: '1500', PULSE_WIDTH_MS: '150',
  RECONNECT_BASE_MS: '500', RECONNECT_MAX_MS: '5000', WS_HOST: '127.0.0.1', WS_PORT: '18080',
});

class HmiDePrueba {
  estado = null;
  mensajes = [];
  #acks = [];

  conectar(url) {
    this.socket = new WebSocket(url);
    this.socket.on('message', (datos) => {
      const mensaje = JSON.parse(datos);
      if (mensaje.type === 'ack') this.#acks.push(mensaje);
      else {
        this.estado = mensaje;
        this.mensajes.push({ t: performance.now(), mensaje });
      }
    });
    return new Promise((resolve, reject) => this.socket.once('open', resolve).once('error', reject));
  }

  async enviar(comando, plazoMs = 1000) {
    const previos = this.#acks.length;
    this.socket.send(typeof comando === 'string' ? comando : JSON.stringify(comando));
    const t0 = performance.now();
    while (this.#acks.length === previos) {
      if (performance.now() - t0 > plazoMs) assert.fail('sin ack del middleware');
      await esperar(10);
    }
    return this.#acks.at(-1);
  }

  async esperarEstado(condicion, plazoMs, descripcion) {
    const t0 = performance.now();
    while (!(this.estado && condicion(this.estado))) {
      if (performance.now() - t0 > plazoMs) {
        assert.fail(`${descripcion} no ocurrió en ${plazoMs} ms; último estado: ${JSON.stringify(this.estado)}`);
      }
      await esperar(10);
    }
    return performance.now() - t0;
  }
}

const enStatus = (status) => (e) => e.systemStatus === status;

let plc;
let puente;
const hmi = new HmiDePrueba();

before(async () => {
  plc = new PlcVirtual({ port: PUERTO_PLC });
  await plc.iniciar();
  puente = await iniciarPuente(config, pino({ level: 'silent' }));
  await hmi.conectar(`ws://127.0.0.1:${config.ws.port}`);
  await hmi.esperarEstado((e) => e.plcConnected, 2000, 'conexión con el PLC');
});

after(async () => {
  hmi.socket?.terminate();
  await puente?.detener();
  await plc?.detener();
});

describe('Middleware Modbus → WebSocket (Contrato v1.2.0)', () => {
  test('publica cada ≈ 50 ms un estado con las 4 tablas del contrato v1.2.0', async () => {
    const desde = hmi.mensajes.length;
    await esperar(1000);
    const recibidos = hmi.mensajes.slice(desde).length;
    assert.ok(recibidos >= 14 && recibidos <= 25, `${recibidos} estados en 1 s (esperado ≈ 20)`);

    const e = hmi.estado;
    assert.deepEqual(
      Object.keys(e),
      ['timestamp', 'plcConnected', 'heartbeat', 'inputs', 'outputs', 'holdingRegisters', 'inputRegisters', 'systemStatus'],
    );
    assert.deepEqual(Object.keys(e.inputs), [
      'marcha', 'parada', 'emergencia', 'sensorEntrada', 'selectorDestinoB',
      'estibaLlenaA', 'estibaLlenaB', 'sensorSalidaA', 'sensorSalidaB', 'atascoEnBanda',
    ]);
    assert.deepEqual(Object.keys(e.outputs), [
      'cintaEntrada', 'desviadorActivo', 'cintaSalidaA', 'cintaSalidaB', 'balizaAlarma',
      'senalCambioEstiba', 'frenoAdmision', 'alarmaAtasco', 'avisoNoRead', 'balizaVerde',
    ]);
    assert.ok(Number.isInteger(e.timestamp) && e.plcConnected === true);
    assert.equal(e.systemStatus, 'REPOSO');
  });

  test('marcha (pulse): pulso de ≈ 150 ms en el PLC, ack ok y ESPERANDO_PAQUETE', async () => {
    const cambios = [];
    const registrar = ({ nombre, valor }) => nombre === 'Marcha' && cambios.push({ valor, t: performance.now() });
    plc.on('entrada', registrar);
    const ack = await hmi.enviar({ type: 'command', target: 'marcha', action: 'pulse' });
    await esperar(3 * plc.tScanMs);
    plc.off('entrada', registrar);

    assert.deepEqual(ack, { type: 'ack', target: 'marcha', ok: true });
    assert.deepEqual(cambios.map((c) => c.valor), [true, false]);
    const ancho = cambios[1].t - cambios[0].t;
    assert.ok(ancho >= 130 && ancho <= 250, `pulso de ${Math.round(ancho)} ms`);
    await hmi.esperarEstado(enStatus('ESPERANDO_PAQUETE'), 300, 'ESPERANDO_PAQUETE');
  });

  test('selector y sensor (set) → CLASIFICANDO_RUTA_B con stopper activo; sensorSalidaB cierra el lazo', async () => {
    await hmi.enviar({ type: 'command', target: 'selectorDestinoB', action: 'set', value: true });
    await hmi.enviar({ type: 'command', target: 'sensorEntrada', action: 'set', value: true });
    await hmi.esperarEstado(enStatus('CLASIFICANDO_RUTA_B'), 300, 'CLASIFICANDO_RUTA_B');
    await hmi.esperarEstado((e) => e.inputs.selectorDestinoB && e.inputs.sensorEntrada, 300, 'readback de selector y sensor');
    assert.equal(hmi.estado.outputs.desviadorActivo, true);
    assert.equal(hmi.estado.outputs.frenoAdmision, true);
    assert.equal(hmi.estado.inputRegisters.paquetesB, 1);
    await hmi.enviar({ type: 'command', target: 'sensorEntrada', action: 'set', value: false });

    // Confirmación por fotocelda de salida B (%IX1.0)
    await hmi.enviar({ type: 'command', target: 'sensorSalidaB', action: 'set', value: true });
    await hmi.esperarEstado(enStatus('ESPERANDO_PAQUETE'), 300, 'cierre de lazo a ESPERANDO_PAQUETE');
    await hmi.enviar({ type: 'command', target: 'sensorSalidaB', action: 'set', value: false });
  });

  test('escritura de Holding Registers (FC06) para modo Auto-Escáner y lectura NO_READ → INSPECCION_NO_READ', async () => {
    await hmi.enviar({ type: 'command', target: 'modoRuteo', action: 'write', value: 1 });
    await hmi.enviar({ type: 'command', target: 'skuEscaneado', action: 'write', value: 99 });
    await hmi.enviar({ type: 'command', target: 'sensorEntrada', action: 'set', value: true });
    await hmi.esperarEstado(enStatus('INSPECCION_NO_READ'), 300, 'INSPECCION_NO_READ');
    assert.equal(hmi.estado.outputs.avisoNoRead, true);
    assert.equal(hmi.estado.inputRegisters.noRead, 1);
    assert.equal(hmi.estado.inputRegisters.codigoFalla, 4);
    await hmi.enviar({ type: 'command', target: 'sensorEntrada', action: 'set', value: false });
    await hmi.enviar({ type: 'command', target: 'modoRuteo', action: 'write', value: 0 });
    await hmi.enviar({ type: 'command', target: 'parada', action: 'pulse' });
    await hmi.esperarEstado(enStatus('REPOSO'), 300, 'REPOSO');
  });

  test('rechaza lo que no está en la lista blanca, con el código en el ack', async () => {
    assert.equal((await hmi.enviar('esto no es JSON')).error, 'JSON_INVALIDO');
    assert.equal((await hmi.enviar({ type: 'command', target: 'motor', action: 'set', value: true })).error, 'TARGET_NO_PERMITIDO');
    assert.equal((await hmi.enviar({ type: 'command', target: 'parada', action: 'set', value: true })).error, 'ACCION_NO_PERMITIDA');
  });

  test('estiba llena (set) → ESPERANDO_CAMBIO_ESTIBA con señal Q6; al liberarla, REPOSO', async () => {
    await hmi.enviar({ type: 'command', target: 'estibaLlenaA', action: 'set', value: true });
    await hmi.esperarEstado(enStatus('ESPERANDO_CAMBIO_ESTIBA'), 300, 'ESPERANDO_CAMBIO_ESTIBA');
    await hmi.esperarEstado((e) => e.inputs.estibaLlenaA && e.outputs.senalCambioEstiba, 300, 'readback y Q6');
    assert.equal(hmi.estado.outputs.cintaEntrada, false, 'P6: ninguna cinta se mueve');
    await hmi.enviar({ type: 'command', target: 'estibaLlenaA', action: 'set', value: false });
    await hmi.esperarEstado(enStatus('REPOSO'), 300, 'REPOSO tras liberar la estiba (T10)');
  });

  test('heartbeat congelado (PLC en STOP) → SIN_CONEXION_PLC; en RUN se recupera', async () => {
    await hmi.esperarEstado((e) => e.plcConnected, 500, 'PLC vivo');
    plc.pausar();
    const t = await hmi.esperarEstado(enStatus('SIN_CONEXION_PLC'), 3000, 'detección del heartbeat congelado');
    assert.ok(t >= 900, `detectado a los ${Math.round(t)} ms: demasiado pronto para T_stale = 1500 ms`);
    assert.equal(hmi.estado.plcConnected, false);
    assert.ok(Object.values(hmi.estado.outputs).every((v) => v === false), 'degradación segura: salidas en false');

    plc.reanudar();
    await hmi.esperarEstado((e) => e.plcConnected, 1500, 'recuperación del heartbeat');
  });

  test('caída del PLC → SIN_CONEXION_PLC y comandos rechazados con PLC_DESCONECTADO', async () => {
    await hmi.enviar({ type: 'command', target: 'emergencia', action: 'set', value: true });
    await hmi.esperarEstado(enStatus('PARADA_EMERGENCIA'), 300, 'PARADA_EMERGENCIA');

    await plc.detener();
    await hmi.esperarEstado(enStatus('SIN_CONEXION_PLC'), 2500, 'detección de la caída');
    const ack = await hmi.enviar({ type: 'command', target: 'marcha', action: 'pulse' });
    assert.deepEqual(ack, { type: 'ack', target: 'marcha', ok: false, error: 'PLC_DESCONECTADO' });
  });

  test('reconexión con inicialización segura: se conservan seta y selector, el resto a 0', async () => {
    plc = new PlcVirtual({ port: PUERTO_PLC });
    await plc.iniciar();
    await hmi.esperarEstado((e) => e.plcConnected, 6000, 'reconexión');

    await hmi.esperarEstado(enStatus('PARADA_EMERGENCIA'), 500, 'emergencia reaplicada tras reconectar');
    assert.deepEqual(hmi.estado.inputs, {
      marcha: false, parada: false, emergencia: true, sensorEntrada: false, selectorDestinoB: true,
      estibaLlenaA: false, estibaLlenaB: false, sensorSalidaA: false, sensorSalidaB: false, atascoEnBanda: false,
    });

    await hmi.enviar({ type: 'command', target: 'emergencia', action: 'set', value: false });
    await hmi.enviar({ type: 'command', target: 'parada', action: 'pulse' });
    await hmi.esperarEstado(enStatus('REPOSO'), 500, 'REPOSO tras el rearme');
  });
});
