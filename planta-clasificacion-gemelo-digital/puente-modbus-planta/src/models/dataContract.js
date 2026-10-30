// Contrato de datos v1.2.0: 4 tablas Modbus TCP (Coils FC01/05, Discrete Inputs FC02,
// Holding Registers FC03/06, Input Registers FC04) → mensaje JSON inmutable,
// λ⁻¹ extendida y lista blanca de comandos. Funciones puras, sin E/S.

export const VERSION_CONTRATO = '1.2.0';

// Coils 0..9 (%IX0.0..1.1)
export const CAMPOS_INPUTS = Object.freeze([
  ['marcha', 0],
  ['parada', 1],
  ['emergencia', 2],
  ['sensorEntrada', 3],
  ['selectorDestinoB', 4],
  ['estibaLlenaA', 5],
  ['estibaLlenaB', 6],
  ['sensorSalidaA', 7],
  ['sensorSalidaB', 8],
  ['atascoEnBanda', 9],
]);

// Discrete Inputs 0..4 y 6..10 (%QX). El DI 5 es el heartbeat, que va en la raíz.
export const CAMPOS_OUTPUTS = Object.freeze([
  ['cintaEntrada', 0],
  ['desviadorActivo', 1],
  ['cintaSalidaA', 2],
  ['cintaSalidaB', 3],
  ['balizaAlarma', 4],
  ['senalCambioEstiba', 6],
  ['frenoAdmision', 7],
  ['alarmaAtasco', 8],
  ['avisoNoRead', 9],
  ['balizaVerde', 10],
]);
const DI_HEARTBEAT = 5;

// Holding Registers 0..3 (%MW0..3, FC03/FC06)
export const CAMPOS_HOLDING = Object.freeze([
  ['modoRuteo', 0, 0],
  ['skuEscaneado', 1, 0],
  ['modoWatchdog', 2, 0],
  ['tiempoWatchdogMs', 3, 4000],
]);

// Input Registers 0..7 (%IW0..7, FC04)
export const CAMPOS_INPUT_REGISTERS = Object.freeze([
  ['estadoFsm', 0],
  ['codigoFalla', 1],
  ['paquetesA', 2],
  ['paquetesB', 3],
  ['atascos', 4],
  ['noRead', 5],
  ['tiempoClasifMs', 6],
  ['ultimoSku', 7],
]);

// λ⁻¹ base sobre (q0 q1 q2 q3 q4 q6) y extensión con (q8 alarmaAtasco, q9 avisoNoRead)
const LAMBDA_INVERSA = Object.freeze({
  '000000': 'REPOSO',
  '100000': 'ESPERANDO_PAQUETE',
  '101000': 'CLASIFICANDO_RUTA_A',
  '110100': 'CLASIFICANDO_RUTA_B',
  '000010': 'PARADA_EMERGENCIA',
  '000001': 'ESPERANDO_CAMBIO_ESTIBA',
});

// Lista blanca de comandos: Coils (FC05) y Holding Registers (FC06)
export const COMANDOS = Object.freeze({
  marcha:           Object.freeze({ tipo: 'coil', coil: 0, accion: 'pulse' }),
  parada:           Object.freeze({ tipo: 'coil', coil: 1, accion: 'pulse' }),
  emergencia:       Object.freeze({ tipo: 'coil', coil: 2, accion: 'set' }),
  sensorEntrada:    Object.freeze({ tipo: 'coil', coil: 3, accion: 'set' }),
  selectorDestinoB: Object.freeze({ tipo: 'coil', coil: 4, accion: 'set' }),
  estibaLlenaA:     Object.freeze({ tipo: 'coil', coil: 5, accion: 'set' }),
  estibaLlenaB:     Object.freeze({ tipo: 'coil', coil: 6, accion: 'set' }),
  sensorSalidaA:    Object.freeze({ tipo: 'coil', coil: 7, accion: 'set' }),
  sensorSalidaB:    Object.freeze({ tipo: 'coil', coil: 8, accion: 'set' }),
  atascoEnBanda:    Object.freeze({ tipo: 'coil', coil: 9, accion: 'set' }),
  modoRuteo:        Object.freeze({ tipo: 'register', register: 0, accion: 'write', min: 0, max: 2 }),
  skuEscaneado:     Object.freeze({ tipo: 'register', register: 1, accion: 'write', valores: [0, 1, 2, 99] }),
  modoWatchdog:     Object.freeze({ tipo: 'register', register: 2, accion: 'write', min: 0, max: 1 }),
  tiempoWatchdogMs: Object.freeze({ tipo: 'register', register: 3, accion: 'write', min: 1000, max: 15000 }),
});

export function systemStatusDe(discreteInputs) {
  const baseIndices = [0, 1, 2, 3, 4, 6];
  const palabra = baseIndices.map((di) => Number(Boolean(discreteInputs[di]))).join('');
  const base = LAMBDA_INVERSA[palabra];
  if (!base) return 'ESTADO_INDETERMINADO';
  if (base === 'PARADA_EMERGENCIA' && Boolean(discreteInputs[8])) return 'FALLA_ATASCO';
  if (base === 'ESPERANDO_CAMBIO_ESTIBA' && Boolean(discreteInputs[9])) return 'INSPECCION_NO_READ';
  return base;
}

const objetoDeBits = (campos, bits) =>
  Object.freeze(Object.fromEntries(campos.map(([campo, direccion]) => [campo, Boolean(bits[direccion])])));

const objetoDeRegistros = (campos, registros, usarDefecto = false) =>
  Object.freeze(Object.fromEntries(campos.map(([campo, direccion, defecto = 0]) => [
    campo,
    usarDefecto && registros[direccion] === undefined ? defecto : Number(registros[direccion] ?? 0),
  ])));

// Mensaje de estado inmutable. `plcVivo` = conexión abierta y heartbeat activo;
// si es falso se aplica la regla de degradación segura (todo en false/0 y SIN_CONEXION_PLC).
export function construirEstado({
  plcVivo,
  coils = [],
  discreteInputs = [],
  holdingRegisters = [],
  inputRegisters = [],
  timestamp = Date.now(),
}) {
  if (!plcVivo) {
    return Object.freeze({
      timestamp,
      plcConnected: false,
      heartbeat: false,
      inputs: objetoDeBits(CAMPOS_INPUTS, []),
      outputs: objetoDeBits(CAMPOS_OUTPUTS, []),
      holdingRegisters: objetoDeRegistros(CAMPOS_HOLDING, [], true),
      inputRegisters: objetoDeRegistros(CAMPOS_INPUT_REGISTERS, []),
      systemStatus: 'SIN_CONEXION_PLC',
    });
  }
  return Object.freeze({
    timestamp,
    plcConnected: true,
    heartbeat: Boolean(discreteInputs[DI_HEARTBEAT]),
    inputs: objetoDeBits(CAMPOS_INPUTS, coils),
    outputs: objetoDeBits(CAMPOS_OUTPUTS, discreteInputs),
    holdingRegisters: objetoDeRegistros(CAMPOS_HOLDING, holdingRegisters, true),
    inputRegisters: objetoDeRegistros(CAMPOS_INPUT_REGISTERS, inputRegisters),
    systemStatus: systemStatusDe(discreteInputs),
  });
}

const rechazo = (target, error) => ({ ok: false, target, error });

// Valida un mensaje entrante del WebSocket. Devuelve el comando listo para el
// cliente Modbus (coil o holding register) o el código de error para el ack.
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

  if (definicion.tipo === 'coil') {
    if (definicion.accion === 'set' && typeof mensaje.value !== 'boolean') return rechazo(target, 'VALOR_INVALIDO');
    return {
      ok: true,
      comando: Object.freeze({
        tipo: 'coil',
        target,
        coil: definicion.coil,
        accion: definicion.accion,
        valor: mensaje.value,
      }),
    };
  }

  if (typeof mensaje.value !== 'number' || !Number.isInteger(mensaje.value)) {
    return rechazo(target, 'VALOR_INVALIDO');
  }
  if (definicion.valores && !definicion.valores.includes(mensaje.value)) {
    return rechazo(target, 'VALOR_INVALIDO');
  }
  if (definicion.min !== undefined && (mensaje.value < definicion.min || mensaje.value > definicion.max)) {
    return rechazo(target, 'VALOR_INVALIDO');
  }

  return {
    ok: true,
    comando: Object.freeze({
      tipo: 'register',
      target,
      register: definicion.register,
      accion: 'write',
      valor: mensaje.value,
    }),
  };
}

export function crearAck(target, ok, error) {
  return ok ? { type: 'ack', target, ok } : { type: 'ack', target, ok, error };
}
