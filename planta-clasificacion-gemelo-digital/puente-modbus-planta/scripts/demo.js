// Demostración narrada de lo construido hasta la Fase 3. El PLC virtual y el
// middleware corren como procesos separados (igual que en uso real) y una HMI de
// prueba opera la planta por WebSocket. Cada línea indica qué capa la produce:
// [HMI] → [MW] → [PLC].
// Uso: npm run demo   (≈ 30 s; usa puertos propios y no interfiere con npm start)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import readline from 'node:readline';
import { setTimeout as esperar } from 'node:timers/promises';
import WebSocket from 'ws';

const PUERTO_PLC = 15040;
const PUERTO_WS = 18090;
const RUTA_PLC = fileURLToPath(new URL('../../plc-virtual/src/index.js', import.meta.url));
const RUTA_PUENTE = fileURLToPath(new URL('../src/index.js', import.meta.url));
const ENV_PUENTE = {
  MODBUS_HOST: '127.0.0.1', MODBUS_PORT: String(PUERTO_PLC), MODBUS_UNIT_ID: '1', MODBUS_TIMEOUT_MS: '2000',
  POLL_INTERVAL_MS: '50', HEARTBEAT_STALE_MS: '1500', PULSE_WIDTH_MS: '150',
  RECONNECT_BASE_MS: '500', RECONNECT_MAX_MS: '5000', WS_HOST: '127.0.0.1', WS_PORT: String(PUERTO_WS), LOG_LEVEL: 'info',
};

const t0 = performance.now();
const reloj = () => `${((performance.now() - t0) / 1000).toFixed(1).padStart(5)} s`;
const imprimir = (capa, texto) => console.log(`${reloj()}  ${capa}  ${texto}`);
const paso = (n, titulo) => console.log(`\n── ${n}. ${titulo} ${'─'.repeat(Math.max(2, 66 - titulo.length))}`);

// ---------------------------------------------------------------- procesos --
const procesos = new Set();
process.on('exit', () => procesos.forEach((hijo) => hijo.kill('SIGKILL')));

function lanzar(ruta, env, alLeerLinea) {
  const hijo = spawn(process.execPath, [ruta], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  procesos.add(hijo);
  hijo.on('exit', () => procesos.delete(hijo));
  readline.createInterface({ input: hijo.stdout }).on('line', alLeerLinea);
  readline.createInterface({ input: hijo.stderr }).on('line', (linea) => imprimir('[ERR]', linea));
  return hijo;
}

function lanzarPlc() {
  return new Promise((resolve) => {
    const hijo = lanzar(RUTA_PLC, { PLC_PORT: String(PUERTO_PLC) }, (linea) => {
      const texto = linea.slice(14);   // sin la hora del registro del PLC
      if (texto.startsWith('PLC virtual en marcha')) {
        imprimir('[PLC]', `en marcha · esclavo Modbus en 127.0.0.1:${PUERTO_PLC}`);
        resolve(hijo);
      } else if (/^(eEstado: \S+ →|Coil|Programa)/.test(texto)) {
        imprimir('[PLC]', texto);
      }
    });
  });
}

// Solo los eventos del middleware que no repiten lo que ya muestran HMI y PLC
const RESUMEN_MW = {
  'puente Modbus → WebSocket en marcha': (r) => `en marcha · Modbus ${r.modbus} → ${r.websocket}`,
  'conectado al PLC; inicialización segura aplicada (FC15)':
    (r) => `conectado al PLC · inicialización segura FC15 = [${r.inicializacion.map(Number).join(' ')}]`,
  'conexión con el PLC perdida': (r) => `⚠ conexión perdida (${r.motivo})`,
  'reintento de conexión programado': (r) => `reintento ${r.intento} dentro de ${r.esperaMs} ms`,
  'heartbeat congelado: el PLC no está ejecutando': (r) => `⚠ heartbeat congelado ${r.congeladoMs} ms → PLC no ejecuta`,
  'heartbeat recuperado': () => 'heartbeat recuperado',
  'comando rechazado': (r) => `✗ comando rechazado: ${r.error}`,
  'comando no aplicado': (r) => `✗ comando no aplicado: ${r.error}`,
};

function lanzarPuente() {
  return new Promise((resolve) => {
    const hijo = lanzar(RUTA_PUENTE, ENV_PUENTE, (linea) => {
      let registro;
      try {
        registro = JSON.parse(linea);
      } catch {
        return;
      }
      const resumen = RESUMEN_MW[registro.msg];
      if (resumen) imprimir('[MW] ', resumen(registro));
      if (registro.msg === 'puente Modbus → WebSocket en marcha') resolve(hijo);
    });
  });
}

// ------------------------------------------------------------ HMI de prueba --
const marca = (valor) => (valor ? '■' : '·');
// Sin PLC el mensaje degradado no trae datos reales de entradas: no se interpretan
const describir = ({ systemStatus, plcConnected, outputs: o, inputs: i }) => `${systemStatus.padEnd(21)}`
  + ` cinta ${marca(o.cintaEntrada)}  desv ${marca(o.desviadorActivo)}  A ${marca(o.cintaSalidaA)}`
  + `  B ${marca(o.cintaSalidaB)}  baliza ${marca(o.balizaAlarma)}  │ `
  + (plcConnected ? `seta ${marca(i.emergencia)} ruta ${i.selectorDestinoB ? 'B' : 'A'}` : 'sin datos del PLC');

class Hmi {
  estado = null;
  estadosRecibidos = 0;
  #acks = [];
  #lineaPrevia = '';

  conectar() {
    this.socket = new WebSocket(`ws://127.0.0.1:${PUERTO_WS}`);
    this.socket.on('message', (datos) => {
      const mensaje = JSON.parse(datos);
      if (mensaje.type === 'ack') {
        this.#acks.push(mensaje);
        return;
      }
      this.estado = mensaje;
      this.estadosRecibidos += 1;
      const linea = describir(mensaje);
      if (linea !== this.#lineaPrevia) {
        imprimir('[HMI]', linea);
        this.#lineaPrevia = linea;
      }
    });
    return new Promise((resolve, reject) => this.socket.once('open', resolve).once('error', reject));
  }

  async orden(etiqueta, comando) {
    imprimir('[HMI]', `→ ${etiqueta}`);
    const previos = this.#acks.length;
    this.socket.send(JSON.stringify({ type: 'command', ...comando }));
    while (this.#acks.length === previos) await esperar(5);
    const ack = this.#acks.at(-1);
    if (!ack.ok) imprimir('[HMI]', `← rechazada: ${ack.error}`);
    return ack;
  }

  async esperar(condicion, plazoMs) {
    const cumple = typeof condicion === 'string' ? (e) => e.systemStatus === condicion : condicion;
    const inicio = performance.now();
    while (!(this.estado && cumple(this.estado))) {
      if (performance.now() - inicio > plazoMs) {
        throw new Error(`no se alcanzó ${typeof condicion === 'string' ? condicion : 'la condición'} en ${plazoMs} ms`);
      }
      await esperar(10);
    }
    return performance.now() - inicio;
  }
}

const MARCHA = { target: 'marcha', action: 'pulse' };
const PARADA = { target: 'parada', action: 'pulse' };
const nivel = (target, value) => ({ target, action: 'set', value });

// --------------------------------------------------------------- recorrido --
async function demostrar() {
  console.log('Planta de clasificación · demostración de las Fases 2 y 3 (PLC virtual + middleware)');

  paso(1, 'Arranque: PLC y middleware como procesos separados');
  let plc = await lanzarPlc();
  const puente = await lanzarPuente();
  const hmi = new Hmi();
  await hmi.conectar();
  await hmi.esperar('REPOSO', 2000);

  paso(2, 'Paquete por la ruta A, interrumpido con Parada (T2, T4, T7)');
  await hmi.orden('selector en ruta A', nivel('selectorDestinoB', false));
  await hmi.orden('Marcha (pulso de 150 ms)', MARCHA);
  await hmi.esperar('ESPERANDO_PAQUETE', 500);
  await hmi.orden('el paquete llega al sensor', nivel('sensorEntrada', true));
  await hmi.esperar('CLASIFICANDO_RUTA_A', 500);
  await hmi.orden('el paquete deja el sensor', nivel('sensorEntrada', false));
  await esperar(1000);
  await hmi.orden('Parada en mitad de la clasificación', PARADA);
  await hmi.esperar('REPOSO', 500);

  paso(3, 'Paquete por la ruta B hasta el final (T5, T6)');
  await hmi.orden('selector en ruta B', nivel('selectorDestinoB', true));
  await hmi.orden('Marcha', MARCHA);
  await hmi.esperar('ESPERANDO_PAQUETE', 500);
  const inicioB = performance.now();
  await hmi.orden('el paquete llega al sensor', nivel('sensorEntrada', true));
  await hmi.esperar('CLASIFICANDO_RUTA_B', 500);
  await hmi.orden('el paquete deja el sensor', nivel('sensorEntrada', false));
  await hmi.esperar('ESPERANDO_PAQUETE', 5000);
  imprimir('[HMI]', `clasificación completa en ${((performance.now() - inicioB) / 1000).toFixed(2)} s (T_CLASIFICACION = 4 s)`);

  paso(4, 'Emergencia: detiene todo y no se rearma sola (T1, T8)');
  await hmi.orden('seta de emergencia pulsada', nivel('emergencia', true));
  await hmi.esperar('PARADA_EMERGENCIA', 300);
  await hmi.orden('seta liberada', nivel('emergencia', false));
  await esperar(800);
  imprimir('[HMI]', `tras 0,8 s sigue en ${hmi.estado.systemStatus}: hace falta un rearme consciente`);
  await hmi.orden('Parada (rearme)', PARADA);
  await hmi.esperar('REPOSO', 500);

  paso(5, 'Orden que no está en la lista blanca');
  await hmi.orden('orden inventada: motorCinta = true', nivel('motorCinta', true));

  paso(6, 'PLC en STOP: la conexión sigue abierta pero el programa no ejecuta');
  imprimir('[PLC]', '(se escribe "stop" en su terminal)');
  plc.stdin.write('stop\n');
  await hmi.esperar('SIN_CONEXION_PLC', 3000);
  await esperar(400);
  plc.stdin.write('run\n');
  await hmi.esperar((e) => e.plcConnected, 2000);

  paso(7, 'Caída del PLC con la seta pulsada, y regreso');
  await hmi.orden('seta de emergencia pulsada', nivel('emergencia', true));
  await hmi.esperar('PARADA_EMERGENCIA', 300);
  imprimir('[PLC]', '✖ proceso terminado de golpe (kill -9)');
  plc.kill('SIGKILL');
  await hmi.esperar('SIN_CONEXION_PLC', 3000);
  await hmi.orden('Marcha sin PLC', MARCHA);
  await esperar(1200);
  imprimir('[PLC]', '(se vuelve a arrancar: todos sus coils empiezan en 0)');
  plc = await lanzarPlc();
  await hmi.esperar((e) => e.plcConnected, 7000);
  await hmi.esperar('PARADA_EMERGENCIA', 1000);
  imprimir('[HMI]', 'el PLC nuevo recibió la seta por FC15 y quedó en emergencia: falla hacia lo seguro');
  await hmi.orden('seta liberada', nivel('emergencia', false));
  await hmi.orden('Parada (rearme)', PARADA);
  await hmi.esperar('REPOSO', 500);
  await esperar(300);   // deja llegar el OFF del último pulso antes del resumen

  const duracion = (performance.now() - t0) / 1000;
  console.log(`\n✔ Demostración completa en ${duracion.toFixed(1)} s · la HMI recibió ${hmi.estadosRecibidos} estados`
    + ` (≈ ${Math.round(hmi.estadosRecibidos / duracion)} por segundo)`);

  hmi.socket.close();
  puente.kill('SIGINT');
  plc.kill('SIGINT');
}

try {
  await demostrar();
} catch (error) {
  console.error(`\n✖ La demostración se detuvo: ${error.message}`);
  process.exitCode = 1;
}
await esperar(300);
process.exit();
