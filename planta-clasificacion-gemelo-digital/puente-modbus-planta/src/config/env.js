// Configuración del middleware desde .env. Se valida al arrancar: un valor
// inválido detiene el proceso con un mensaje claro en vez de fallar más tarde.
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const RUTA_ENV = fileURLToPath(new URL('../../.env', import.meta.url));
const NIVELES_LOG = ['trace', 'debug', 'info', 'warn', 'error', 'silent'];

// Carga puente-modbus-planta/.env sin sobrescribir variables ya definidas en el entorno
export function cargarEntorno() {
  dotenv.config({ path: RUTA_ENV, quiet: true });
}

function texto(env, nombre, porDefecto) {
  const valor = env[nombre] ?? porDefecto;
  if (!valor) throw new Error(`falta ${nombre} (copiar .env.example como .env)`);
  return valor;
}

function entero(env, nombre, min, max) {
  const valor = Number(texto(env, nombre));
  if (!Number.isInteger(valor) || valor < min || valor > max) {
    throw new Error(`${nombre}=${env[nombre]} no es válido: se espera un entero entre ${min} y ${max}`);
  }
  return valor;
}

export function cargarConfig(env = process.env) {
  const config = {
    modbus: {
      host: texto(env, 'MODBUS_HOST'),
      port: entero(env, 'MODBUS_PORT', 1, 65535),
      unitId: entero(env, 'MODBUS_UNIT_ID', 0, 255),
      timeoutMs: entero(env, 'MODBUS_TIMEOUT_MS', 100, 60000),
    },
    pollIntervalMs: entero(env, 'POLL_INTERVAL_MS', 10, 10000),
    heartbeatStaleMs: entero(env, 'HEARTBEAT_STALE_MS', 100, 60000),
    pulseWidthMs: entero(env, 'PULSE_WIDTH_MS', 10, 10000),
    reconnect: {
      baseMs: entero(env, 'RECONNECT_BASE_MS', 10, 60000),
      maxMs: entero(env, 'RECONNECT_MAX_MS', 10, 600000),
    },
    ws: {
      host: texto(env, 'WS_HOST', '127.0.0.1'),
      port: entero(env, 'WS_PORT', 1, 65535),
    },
    logLevel: texto(env, 'LOG_LEVEL', 'info'),
  };

  if (!NIVELES_LOG.includes(config.logLevel)) {
    throw new Error(`LOG_LEVEL=${config.logLevel} no es válido: ${NIVELES_LOG.join('|')}`);
  }
  // H2: el pulso debe durar más que un ciclo de lectura para que el PLC vea el
  // flanco y el readback (FC01) alcance a registrarlo (docs/02 §5)
  if (config.pulseWidthMs <= config.pollIntervalMs) {
    throw new Error(`PULSE_WIDTH_MS (${config.pulseWidthMs}) debe ser mayor que POLL_INTERVAL_MS (${config.pollIntervalMs})`);
  }
  if (config.reconnect.maxMs < config.reconnect.baseMs) {
    throw new Error('RECONNECT_MAX_MS debe ser mayor o igual que RECONNECT_BASE_MS');
  }

  for (const grupo of [config.modbus, config.reconnect, config.ws]) Object.freeze(grupo);
  return Object.freeze(config);
}
