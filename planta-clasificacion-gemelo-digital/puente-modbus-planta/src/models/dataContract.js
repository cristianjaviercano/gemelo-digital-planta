// Contrato de datos v1.1.0 (docs/02 §3.4, §4 y §6): bits Modbus → mensaje JSON,
// λ⁻¹ y lista blanca de comandos. Funciones puras, sin E/S.

export const VERSION_CONTRATO = '1.1.0';

// Campo JSON → dirección. Coils 0..6 (%IX0.0..0.6); Discrete Inputs 0..4 y 6
// (%QX). El DI 5 es el heartbeat, que va en la raíz del mensaje.
const CAMPOS_INPUTS = Object.freeze([
  ['marcha', 0], ['parada', 1], ['emergencia', 2], ['sensorEntrada', 3], ['selectorDestinoB', 4],
  ['estibaLlenaA', 5], ['estibaLlenaB', 6],
]);
const CAMPOS_OUTPUTS = Object.freeze([
  ['cintaEntrada', 0], ['desviadorActivo', 1], ['cintaSalidaA', 2], ['cintaSalidaB', 3], ['balizaAlarma', 4],
  ['senalCambioEstiba', 6],
]);
const DI_HEARTBEAT = 5;

// λ⁻¹: palabra (q0 q1 q2 q3 q4 q6) → systemStatus (docs/02 §3.4 y §6)
const LAMBDA_INVERSA = Object.freeze({
  '000000': 'REPOSO',
  '100000': 'ESPERANDO_PAQUETE',
  '101000': 'CLASIFICANDO_RUTA_A',
  '110100': 'CLASIFICANDO_RUTA_B',
  '000010': 'PARADA_EMERGENCIA',
  '000001': 'ESPERANDO_CAMBIO_ESTIBA',
});

// Lista blanca de comandos (docs/02 §4.3 y §6): la única vía de escritura hacia el PLC
export const COMANDOS = Object.freeze({
  marcha:           Object.freeze({ coil: 0, accion: 'pulse' }),
  parada:           Object.freeze({ coil: 1, accion: 'pulse' }),
  emergencia:       Object.freeze({ coil: 2, accion: 'set' }),
  sensorEntrada:    Object.freeze({ coil: 3, accion: 'set' }),
  selectorDestinoB: Object.freeze({ coil: 4, accion: 'set' }),
  estibaLlenaA:     Object.freeze({ coil: 5, accion: 'set' }),
  estibaLlenaB:     Object.freeze({ coil: 6, accion: 'set' }),
});

export function systemStatusDe(discreteInputs) {
  const palabra = CAMPOS_OUTPUTS.map(([, di]) => Number(Boolean(discreteInputs[di]))).join('');
  return LAMBDA_INVERSA[palabra] ?? 'ESTADO_INDETERMINADO';
}

const objetoDeBits = (campos, bits) =>
  Object.freeze(Object.fromEntries(campos.map(([campo, direccion]) => [campo, Boolean(bits[direccion])])));

// Mensaje de estado inmutable (docs/02 §4.1). `plcVivo` = conexión abierta y
// heartbeat no congelado; si es falso se aplica la regla de degradación segura:
// todo en false y SIN_CONEXION_PLC, para que la escena 3D se detenga.
export function construirEstado({ plcVivo, coils = [], discreteInputs = [], timestamp = Date.now() }) {
  if (!plcVivo) {
    return Object.freeze({
      timestamp,
      plcConnected: false,
      heartbeat: false,
      inputs: objetoDeBits(CAMPOS_INPUTS, []),
      outputs: objetoDeBits(CAMPOS_OUTPUTS, []),
      systemStatus: 'SIN_CONEXION_PLC',
    });
  }
  return Object.freeze({
    timestamp,
    plcConnected: true,
    heartbeat: Boolean(discreteInputs[DI_HEARTBEAT]),
    inputs: objetoDeBits(CAMPOS_INPUTS, coils),
    outputs: objetoDeBits(CAMPOS_OUTPUTS, discreteInputs),
    systemStatus: systemStatusDe(discreteInputs),
  });
}

const rechazo = (target, error) => ({ ok: false, target, error });

// Valida un mensaje entrante del WebSocket. Devuelve el comando listo para el
// cliente Modbus o el código de error que viajará en el ack.
export function validarComando(texto) {
  let mensaje;
  try {
    mensaje = JSON.parse(texto);
  } catch {
    return rechazo(null, 'JSON_INVALIDO');
  }
  const target = typeof mensaje?.target === 'string' ? mensaje.target : null;
  if (mensaje?.type !== 'command') return rechazo(target, 'TIPO_NO_SOPORTADO');

  const definicion = Object.hasOwn(COMANDOS, target) ? COMANDOS[target] : null;
  if (!definicion) return rechazo(target, 'TARGET_NO_PERMITIDO');
  if (mensaje.action !== definicion.accion) return rechazo(target, 'ACCION_NO_PERMITIDA');
  if (definicion.accion === 'set' && typeof mensaje.value !== 'boolean') return rechazo(target, 'VALOR_INVALIDO');

  return {
    ok: true,
    comando: Object.freeze({ target, coil: definicion.coil, accion: definicion.accion, valor: mensaje.value }),
  };
}

export function crearAck(target, ok, error) {
  return ok ? { type: 'ack', target, ok } : { type: 'ack', target, ok, error };
}
