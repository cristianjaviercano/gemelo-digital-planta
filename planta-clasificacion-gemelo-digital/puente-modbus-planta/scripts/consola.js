// Consola de operador en texto: maneja la planta a través del middleware sin
// la HMI 3D (Fase 4). Requiere el PLC y el middleware en marcha.
// Uso: npm run consola
import readline from 'node:readline';
import WebSocket from 'ws';
import { cargarConfig, cargarEntorno } from '../src/config/env.js';

cargarEntorno();
const { ws } = cargarConfig();
const url = `ws://${ws.host === '0.0.0.0' ? '127.0.0.1' : ws.host}:${ws.port}`;

const ORDENES = {
  m: { target: 'marcha', action: 'pulse' },
  p: { target: 'parada', action: 'pulse' },
  e1: { target: 'emergencia', action: 'set', value: true },
  e0: { target: 'emergencia', action: 'set', value: false },
  s1: { target: 'sensorEntrada', action: 'set', value: true },
  s0: { target: 'sensorEntrada', action: 'set', value: false },
  a: { target: 'selectorDestinoB', action: 'set', value: false },
  b: { target: 'selectorDestinoB', action: 'set', value: true },
  la1: { target: 'estibaLlenaA', action: 'set', value: true },
  la0: { target: 'estibaLlenaA', action: 'set', value: false },
  lb1: { target: 'estibaLlenaB', action: 'set', value: true },
  lb0: { target: 'estibaLlenaB', action: 'set', value: false },
};
const AYUDA = 'Órdenes: m marcha · p parada · e1/e0 emergencia · s1/s0 sensor · a/b ruta'
  + ' · la1/la0 lb1/lb0 estiba A/B no disponible · q salir';

const marca = (valor) => (valor ? '■' : '·');
let lineaPrevia = '';

const socket = new WebSocket(url);
socket.on('open', () => console.log(`Conectado a ${url}\n${AYUDA}`));
socket.on('message', (datos) => {
  const mensaje = JSON.parse(datos);
  if (mensaje.type === 'ack') {
    if (!mensaje.ok) console.log(`  ✗ ${mensaje.target ?? '?'} rechazado: ${mensaje.error}`);
    return;
  }
  const { outputs: o, inputs: i } = mensaje;
  const linea = `${mensaje.systemStatus.padEnd(23)}`
    + ` cinta ${marca(o.cintaEntrada)}  desviador ${marca(o.desviadorActivo)}`
    + `  salida A ${marca(o.cintaSalidaA)}  salida B ${marca(o.cintaSalidaB)}  baliza ${marca(o.balizaAlarma)}`
    + `  cambio estiba ${marca(o.senalCambioEstiba)}`
    + '  │ ' + (mensaje.plcConnected
      ? `seta ${marca(i.emergencia)}  ruta ${i.selectorDestinoB ? 'B' : 'A'}  estibas ${marca(i.estibaLlenaA)}${marca(i.estibaLlenaB)}`
      : 'sin datos del PLC');
  if (linea !== lineaPrevia) {
    console.log(linea);
    lineaPrevia = linea;
  }
});
socket.on('close', () => {
  console.log('Conexión con el middleware cerrada');
  process.exit(0);
});
socket.on('error', (error) => {
  console.error(`No se pudo conectar a ${url} (${error.message}). ¿Está el middleware en marcha? → npm start`);
  process.exit(1);
});

readline.createInterface({ input: process.stdin }).on('line', (entrada) => {
  const orden = entrada.trim().toLowerCase();
  if (orden === 'q') return socket.close();
  if (!ORDENES[orden]) return console.log(AYUDA);
  socket.send(JSON.stringify({ type: 'command', ...ORDENES[orden] }));
});
