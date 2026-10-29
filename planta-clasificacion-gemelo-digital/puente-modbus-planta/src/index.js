// Puente Modbus TCP → WebSocket (capa C2, docs/01 §2). Une las piezas, vigila
// el heartbeat del PLC y publica el estado. No contiene lógica de control.
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import pino from 'pino';
import { cargarConfig, cargarEntorno } from './config/env.js';
import { construirEstado, crearAck, validarComando } from './models/dataContract.js';
import { ClienteModbus } from './services/modbusClient.js';
import { ServidorWebSocket } from './services/websocketServer.js';

export async function iniciarPuente(config, log) {
  const logModbus = log.child({ modulo: 'modbus' });
  const logWs = log.child({ modulo: 'ws' });
  const modbus = new ClienteModbus({
    ...config.modbus,
    pollIntervalMs: config.pollIntervalMs,
    pulseWidthMs: config.pulseWidthMs,
    reconnect: config.reconnect,
  });
  const ws = new ServidorWebSocket(config.ws, logWs);

  let statusPrevio = null;
  const publicar = (estado) => {
    ws.difundir(estado);
    if (estado.systemStatus !== statusPrevio) {
      log.info({ desde: statusPrevio, hacia: estado.systemStatus }, 'systemStatus');
      statusPrevio = estado.systemStatus;
    }
  };

  // Vigilancia del heartbeat: la conexión TCP abierta no garantiza que el PLC
  // esté ejecutando. Si %QX0.5 no cambia en T_stale, el PLC se considera caído.
  let heartbeatPrevio = null;
  let ultimoCambio = 0;
  let heartbeatVivo = true;

  modbus.on('conectado', ({ inicializacion }) => {
    heartbeatPrevio = null;
    ultimoCambio = performance.now();
    logModbus.info({ inicializacion }, 'conectado al PLC; inicialización segura aplicada (FC15)');
  });
  modbus.on('desconectado', ({ motivo }) => {
    logModbus.warn({ motivo }, 'conexión con el PLC perdida');
    publicar(construirEstado({ plcVivo: false }));
  });
  modbus.on('reintento', ({ intento, esperaMs, motivo }) => {
    logModbus.info({ intento, esperaMs, motivo }, 'reintento de conexión programado');
  });
  modbus.on('lectura', ({ coils, discreteInputs }) => {
    const ahora = performance.now();
    if (discreteInputs[5] !== heartbeatPrevio) {
      heartbeatPrevio = discreteInputs[5];
      ultimoCambio = ahora;
    }
    const vivo = ahora - ultimoCambio <= config.heartbeatStaleMs;
    if (vivo !== heartbeatVivo) {
      if (vivo) logModbus.info('heartbeat recuperado');
      else logModbus.warn({ congeladoMs: Math.round(ahora - ultimoCambio) }, 'heartbeat congelado: el PLC no está ejecutando');
      heartbeatVivo = vivo;
    }
    publicar(construirEstado({ plcVivo: vivo, coils, discreteInputs }));
  });

  // Sin conexión no hay ciclos de lectura: se sigue publicando el estado
  // degradado cada T_p para que la HMI sepa que el middleware está vivo
  const tickSinConexion = setInterval(() => {
    if (!modbus.conectado) publicar(construirEstado({ plcVivo: false }));
  }, config.pollIntervalMs);

  ws.on('comando', async ({ texto, responder, cliente }) => {
    const validacion = validarComando(texto);
    if (!validacion.ok) {
      logWs.warn({ cliente, error: validacion.error, mensaje: texto.slice(0, 200) }, 'comando rechazado');
      responder(crearAck(validacion.target, false, validacion.error));
      return;
    }
    const { target, coil, accion, valor } = validacion.comando;
    try {
      if (accion === 'pulse') await modbus.pulso(coil);
      else await modbus.escribirCoil(coil, valor);
      logWs.info({ cliente, target, accion, valor }, 'comando aplicado');
      responder(crearAck(target, true));
    } catch (error) {
      const codigo = error.code === 'PLC_DESCONECTADO' ? 'PLC_DESCONECTADO' : 'ERROR_MODBUS';
      logWs.warn({ cliente, target, error: error.message }, 'comando no aplicado');
      responder(crearAck(target, false, codigo));
    }
  });

  await ws.iniciar();
  modbus.iniciar();
  log.info({
    modbus: `${config.modbus.host}:${config.modbus.port}`,
    unitId: config.modbus.unitId,
    websocket: `ws://${config.ws.host}:${config.ws.port}`,
    pollIntervalMs: config.pollIntervalMs,
  }, 'puente Modbus → WebSocket en marcha');

  return {
    async detener() {
      clearInterval(tickSinConexion);
      await modbus.detener();
      await ws.detener();
    },
  };
}

// Ejecución directa (npm start / npm run dev); al importarse desde las pruebas no arranca
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  cargarEntorno();
  let config;
  try {
    config = cargarConfig();
  } catch (error) {
    console.error(`Configuración inválida en puente-modbus-planta/.env: ${error.message}`);
    process.exit(1);
  }
  const log = pino({ level: config.logLevel });
  let puente;
  try {
    puente = await iniciarPuente(config, log);
  } catch (error) {
    log.fatal({ error: error.message }, `no se pudo abrir ws://${config.ws.host}:${config.ws.port}`);
    process.exit(1);
  }
  for (const senal of ['SIGINT', 'SIGTERM']) {
    process.once(senal, async () => {
      setTimeout(() => process.exit(0), 2000).unref();   // salida garantizada aunque algo no cierre
      await puente.detener();
      log.info('puente detenido');
      process.exit(0);
    });
  }
}
