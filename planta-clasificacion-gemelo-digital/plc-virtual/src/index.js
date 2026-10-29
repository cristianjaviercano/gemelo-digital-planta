// Arranque del PLC virtual. Sustituye a CODESYS Control Win V3 en macOS/Linux.
// macOS solo permite puertos < 1024 sin root escuchando en 0.0.0.0; para no
// exponer el esclavo a la red se usa 127.0.0.1:5020 (MODBUS_PORT=5020 en el puente).
import readline from 'node:readline';
import { PlcVirtual } from './plcVirtual.js';

const host = process.env.PLC_HOST ?? '127.0.0.1';
const port = Number(process.env.PLC_PORT ?? 5020);
const unitId = Number(process.env.PLC_UNIT_ID ?? 1);

const plc = new PlcVirtual({ host, port, unitId });
const hora = (d = new Date()) => `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
const log = (texto) => console.log(`${hora()}  ${texto}`);

plc.on('entrada', ({ coil, nombre, valor }) => log(`Coil ${coil} ${nombre.padEnd(16)} ← ${valor ? 'TRUE' : 'FALSE'}`));
plc.on('estado', ({ desde, hacia }) => log(`eEstado: ${desde} → ${hacia}`));
plc.on('falla', ({ estado }) => log(`⚠ xFallaCoherencia en ${estado} (violación de P2/P3)`));

try {
  await plc.iniciar();
} catch (error) {
  console.error(`No se pudo abrir ${host}:${port} — ${error.code ?? error.message}`);
  process.exit(1);
}
log(`PLC virtual en marcha · Modbus TCP ${host}:${port} · Unit ID ${unitId} · MainTask ${plc.tScanMs} ms`);
log('eEstado: REPOSO · escribir "stop"/"run" para pausar/reanudar el programa · Ctrl+C para detener');

// STOP/RUN como en CODESYS: con "stop" el esclavo Modbus sigue respondiendo pero
// el heartbeat se congela, y el middleware debe pasar a SIN_CONEXION_PLC
readline.createInterface({ input: process.stdin }).on('line', (linea) => {
  const orden = linea.trim().toLowerCase();
  if (orden === 'stop' && plc.enEjecucion) {
    plc.pausar();
    log('Programa en STOP (Modbus sigue respondiendo; heartbeat congelado)');
  } else if (orden === 'run' && !plc.enEjecucion) {
    plc.reanudar();
    log('Programa en RUN');
  }
});

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.once(senal, async () => {
    await plc.detener();
    log('PLC virtual detenido');
    process.exit(0);
  });
}
