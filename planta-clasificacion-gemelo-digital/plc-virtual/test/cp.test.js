// Protocolo CP-01…CP-19 (docs/03 §3 y docs/08 §3.3) ejecutado como maestro Modbus TCP.
// Solo observa lo que expone el contrato v1.1.0 (Discrete Inputs 0..6 y Coils 0..6), así
// que sirve igual contra el PLC virtual que contra CODESYS:
//   npm test                                    → PLC virtual en proceso (127.0.0.1:15020)
//   PLC_HOST=127.0.0.1 npm test                 → `npm start` en macOS (puerto 5020)
//   PLC_HOST=<ip> PLC_PORT=502 npm test         → CODESYS (windows/README.md §4)
// El estado se infiere de las salidas con λ⁻¹ sobre (q0…q4, q6) (docs/02 §3.4 y §6).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as esperar } from 'node:timers/promises';
import ModbusRTU from 'modbus-serial';
import { PlcVirtual } from '../src/plcVirtual.js';

const EXTERNO = Boolean(process.env.PLC_HOST);
const HOST = process.env.PLC_HOST ?? '127.0.0.1';
const PORT = Number(process.env.PLC_PORT ?? (EXTERNO ? 5020 : 15020));
const UNIT_ID = Number(process.env.PLC_UNIT_ID ?? 1);

const T_PULSO = 150;      // PULSE_WIDTH_MS (H2)
const T_CLAS = 4000;      // GVL_Param.T_CLASIFICACION
const T_SONDEO = 20;
const T_REACCION = 150;   // margen para "inmediato": 1–2 ciclos de scan + ida y vuelta Modbus

const [MARCHA, PARADA, EMERGENCIA, SENSOR, SELECTOR, ESTIBA_A, ESTIBA_B] = [0, 1, 2, 3, 4, 5, 6];
const N_COILS = 7;

// Palabra (q0 q1 q2 q3 q4 q6): el heartbeat q5 no forma parte de λ
const ESTADOS = {
  '000000': 'REPOSO',
  '100000': 'ESPERANDO_PAQUETE',
  '101000': 'CLASIFICANDO_RUTA_A',
  '110100': 'CLASIFICANDO_RUTA_B',
  '000010': 'PARADA_EMERGENCIA',
  '000001': 'ESPERANDO_CAMBIO_ESTIBA',
};

const cliente = new ModbusRTU();
const palabrasObservadas = new Map();   // palabra q0..q4 → nº de lecturas (CP-14)
let plc = null;

async function leerSalidas() {
  const { data } = await cliente.readDiscreteInputs(0, 7);
  const palabra = [...data.slice(0, 5), data[6]].map(Number).join('');
  palabrasObservadas.set(palabra, (palabrasObservadas.get(palabra) ?? 0) + 1);
  return { palabra, estado: ESTADOS[palabra] ?? 'ESTADO_INDETERMINADO', heartbeat: data[5] };
}

async function esperarEstado(estado, plazoMs) {
  const t0 = performance.now();
  let ultimo;
  do {
    ultimo = await leerSalidas();
    if (ultimo.estado === estado) return performance.now() - t0;
    await esperar(T_SONDEO);
  } while (performance.now() - t0 <= plazoMs);
  assert.fail(`se esperaba ${estado} en ≤ ${plazoMs} ms; quedó en ${ultimo.estado} (${ultimo.palabra})`);
}

async function mantieneEstado(estado, duracionMs) {
  const t0 = performance.now();
  while (performance.now() - t0 < duracionMs) {
    const { estado: actual, palabra } = await leerSalidas();
    const t = Math.round(performance.now() - t0);
    assert.equal(actual, estado, `pasó de ${estado} a ${actual} (${palabra}) a los ${t} ms`);
    await esperar(T_SONDEO);
  }
}

const fijar = (coil, valor) => cliente.writeCoil(coil, valor);

async function pulso(coil) {
  await fijar(coil, true);
  await esperar(T_PULSO);
  await fijar(coil, false);
}

// Inicialización segura (FC15) y rearme hasta REPOSO desde cualquier estado.
// La espera garantiza que el PLC vea las órdenes en FALSE antes del siguiente
// flanco (H2); sin ella, liberar y volver a pulsar en < T_scan no genera flanco.
async function reiniciar() {
  await cliente.writeCoils(0, Array(N_COILS).fill(false));
  await esperar(T_PULSO);
  if ((await leerSalidas()).estado !== 'REPOSO') await pulso(PARADA);
  await esperarEstado('REPOSO', 500);
}

async function enEspera() {
  await reiniciar();
  await pulso(MARCHA);
  await esperarEstado('ESPERANDO_PAQUETE', T_REACCION);
}

// Lleva a CLASIFICANDO_RUTA_A/B y devuelve el instante del flanco del sensor
async function clasificando(rutaB) {
  await enEspera();
  await fijar(SELECTOR, rutaB);
  await fijar(SENSOR, true);
  const tFlanco = performance.now();
  await esperarEstado(rutaB ? 'CLASIFICANDO_RUTA_B' : 'CLASIFICANDO_RUTA_A', T_REACCION);
  await fijar(SENSOR, false);
  return tFlanco;
}

before(async () => {
  if (!EXTERNO) {
    plc = new PlcVirtual({ host: HOST, port: PORT, unitId: UNIT_ID });
    await plc.iniciar();
  }
  await cliente.connectTCP(HOST, { port: PORT });
  cliente.setID(UNIT_ID);
  cliente.setTimeout(2000);
});

after(async () => {
  await reiniciar().catch(() => {});
  await new Promise((resolve) => cliente.close(resolve));
  await plc?.detener();
});

describe(`Contrato Modbus v1.1.0 · ${EXTERNO ? 'esclavo externo' : 'PLC virtual'} ${HOST}:${PORT}`, () => {
  test('FC01 devuelve las órdenes efectivamente presentes en el PLC (readback)', async () => {
    await reiniciar();
    await fijar(SELECTOR, true);
    const { data } = await cliente.readCoils(0, N_COILS);
    assert.deepEqual(data.slice(0, N_COILS), [false, false, false, false, true, false, false]);
    await fijar(SELECTOR, false);
  });
});

describe('Protocolo CP-01 … CP-14', () => {
  test('CP-01 · REPOSO con %QX0.0–0.4 en FALSE y heartbeat de ≈ 1 s', async () => {
    await reiniciar();
    await mantieneEstado('REPOSO', 300);

    const conmutaciones = [];
    let previo = (await leerSalidas()).heartbeat;
    const t0 = performance.now();
    while (performance.now() - t0 < 2600) {
      await esperar(T_SONDEO);
      const { heartbeat } = await leerSalidas();
      if (heartbeat !== previo) {
        conmutaciones.push(performance.now());
        previo = heartbeat;
      }
    }
    assert.ok(conmutaciones.length >= 3, `solo ${conmutaciones.length} conmutaciones de %QX0.5 en 2,6 s`);
    const semiperiodos = conmutaciones.slice(1).map((t, i) => Math.round(t - conmutaciones[i]));
    for (const s of semiperiodos) {
      assert.ok(s >= 420 && s <= 680, `semiperiodo de ${s} ms (esperado ≈ 500 ms); medidos: ${semiperiodos}`);
    }
  });

  test('CP-02 · pulso de Marcha en REPOSO → EN_MARCHA_ESPERA (T2)', async () => {
    await reiniciar();
    await pulso(MARCHA);
    await esperarEstado('ESPERANDO_PAQUETE', T_REACCION);
    await mantieneEstado('ESPERANDO_PAQUETE', 300);
  });

  test('CP-03 · Marcha y Parada simultáneos → permanece REPOSO', async () => {
    await reiniciar();
    await cliente.writeCoils(0, [true, true, false, false, false, false, false]);
    await esperar(T_PULSO);
    await cliente.writeCoils(0, Array(N_COILS).fill(false));
    await mantieneEstado('REPOSO', 400);
  });

  test('CP-04 · Sensor ↑ con Selector = FALSE → CLASIFICANDO_RUTA_A (T4)', async () => {
    await clasificando(false);
  });

  test('CP-05 · Sensor ↑ con Selector = TRUE → CLASIFICANDO_RUTA_B (T5)', async () => {
    await clasificando(true);
  });

  test('CP-06 · cambiar el Selector durante RUTA_A no afecta ruta ni desviador (P5)', async () => {
    await clasificando(false);
    await fijar(SELECTOR, true);
    await mantieneEstado('CLASIFICANDO_RUTA_A', 600);
  });

  test('CP-07 · tras T_CLASIFICACION vuelve a EN_MARCHA_ESPERA (T6)', async () => {
    const tFlanco = await clasificando(false);
    await esperarEstado('ESPERANDO_PAQUETE', T_CLAS + 1000);
    const dt = Math.round(performance.now() - tFlanco);
    assert.ok(dt >= T_CLAS - 50 && dt <= T_CLAS + 300, `T6 a los ${dt} ms (esperado ≈ ${T_CLAS} ms)`);
  });

  test('CP-08 · pulso de Parada durante la clasificación → REPOSO inmediato (T7)', async () => {
    await clasificando(true);
    await fijar(PARADA, true);
    await esperarEstado('REPOSO', T_REACCION);
    await fijar(PARADA, false);
    await mantieneEstado('REPOSO', 300);
  });

  test('CP-09 · Emergencia desde cualquier estado → solo %QX0.4 (T1, P1)', async (t) => {
    const origenes = {
      REPOSO: reiniciar,
      ESPERANDO_PAQUETE: enEspera,
      CLASIFICANDO_RUTA_A: () => clasificando(false),
      CLASIFICANDO_RUTA_B: () => clasificando(true),
    };
    for (const [origen, preparar] of Object.entries(origenes)) {
      await t.test(`desde ${origen}`, async () => {
        await preparar();
        await fijar(EMERGENCIA, true);
        await esperarEstado('PARADA_EMERGENCIA', T_REACCION);
        await fijar(EMERGENCIA, false);
      });
    }
  });

  test('CP-10 · liberar la Emergencia no rearma (permanece PARADA_EMERGENCIA)', async () => {
    await reiniciar();
    await fijar(EMERGENCIA, true);
    await esperarEstado('PARADA_EMERGENCIA', T_REACCION);
    await fijar(EMERGENCIA, false);
    await mantieneEstado('PARADA_EMERGENCIA', 500);
  });

  test('CP-11 · pulso de Parada en PARADA_EMERGENCIA → REPOSO (T8)', async () => {
    await reiniciar();
    await fijar(EMERGENCIA, true);
    await esperarEstado('PARADA_EMERGENCIA', T_REACCION);
    await fijar(EMERGENCIA, false);
    await pulso(PARADA);
    await esperarEstado('REPOSO', T_REACCION);
  });

  test('CP-12 · Marcha mantenida durante la emergencia no rearranca tras el rearme (P4)', async () => {
    await reiniciar();
    await fijar(MARCHA, true);
    await esperarEstado('ESPERANDO_PAQUETE', T_REACCION);
    await fijar(EMERGENCIA, true);
    await esperarEstado('PARADA_EMERGENCIA', T_REACCION);
    await fijar(EMERGENCIA, false);
    await pulso(PARADA);
    await esperarEstado('REPOSO', T_REACCION);
    await mantieneEstado('REPOSO', 500);               // Marcha sigue en TRUE: sin flanco, sin arranque
    await fijar(MARCHA, false);
    await esperar(T_PULSO);
    await pulso(MARCHA);                               // un flanco nuevo sí arranca
    await esperarEstado('ESPERANDO_PAQUETE', T_REACCION);
  });

  test('CP-13 · un segundo Sensor ↑ durante la clasificación se ignora (H1)', async () => {
    const tFlanco = await clasificando(true);
    await esperar(200);
    await fijar(SENSOR, true);
    await mantieneEstado('CLASIFICANDO_RUTA_B', 500);
    await fijar(SENSOR, false);
    await esperarEstado('ESPERANDO_PAQUETE', T_CLAS + 1000);
    const dt = Math.round(performance.now() - tFlanco);
    assert.ok(dt <= T_CLAS + 300, `T6 a los ${dt} ms: el segundo flanco reinició el temporizador`);
  });

  test('CP-15 · estiba A llena en EN_MARCHA_ESPERA → ESPERANDO_CAMBIO_ESTIBA, cintas paradas y Q6 (T9, P6)', async () => {
    await enEspera();
    await fijar(ESTIBA_A, true);
    await esperarEstado('ESPERANDO_CAMBIO_ESTIBA', T_REACCION);
    await mantieneEstado('ESPERANDO_CAMBIO_ESTIBA', 400);
    await fijar(ESTIBA_A, false);
  });

  test('CP-16 · estiba B llena durante CLASIFICANDO_RUTA_B → ESPERANDO_CAMBIO_ESTIBA (T9, P6)', async () => {
    await clasificando(true);
    await fijar(ESTIBA_B, true);
    await esperarEstado('ESPERANDO_CAMBIO_ESTIBA', T_REACCION);
    await fijar(ESTIBA_B, false);
  });

  test('CP-17 · con una estiba llena, Marcha no arranca la línea (T9 desde REPOSO)', async () => {
    await reiniciar();
    await fijar(ESTIBA_A, true);
    await esperarEstado('ESPERANDO_CAMBIO_ESTIBA', T_REACCION);
    await pulso(MARCHA);
    await mantieneEstado('ESPERANDO_CAMBIO_ESTIBA', 400);
    await fijar(ESTIBA_A, false);
  });

  test('CP-18 · al cambiar la estiba vuelve a REPOSO y solo arranca con un flanco nuevo de Marcha (T10, P7)', async () => {
    await reiniciar();
    await fijar(MARCHA, true);                         // Marcha mantenida durante todo el bloqueo
    await esperarEstado('ESPERANDO_PAQUETE', T_REACCION);
    await fijar(ESTIBA_B, true);
    await esperarEstado('ESPERANDO_CAMBIO_ESTIBA', T_REACCION);
    await fijar(ESTIBA_B, false);
    await esperarEstado('REPOSO', T_REACCION);
    await mantieneEstado('REPOSO', 400);               // sin flanco, sin arranque
    await fijar(MARCHA, false);
    await esperar(T_PULSO);
    await pulso(MARCHA);
    await esperarEstado('ESPERANDO_PAQUETE', T_REACCION);
  });

  test('CP-19 · emergencia en S5 y rearme con la estiba aún llena: S4 → S0 → S5 (T1, T8, T9)', async () => {
    await reiniciar();
    await fijar(ESTIBA_A, true);
    await esperarEstado('ESPERANDO_CAMBIO_ESTIBA', T_REACCION);
    await fijar(EMERGENCIA, true);
    await esperarEstado('PARADA_EMERGENCIA', T_REACCION);
    await fijar(EMERGENCIA, false);
    await pulso(PARADA);
    await esperarEstado('ESPERANDO_CAMBIO_ESTIBA', T_REACCION);
    await fijar(ESTIBA_A, false);
    await esperarEstado('REPOSO', T_REACCION);
  });

  test('CP-14 · ninguna palabra de salida observada viola P2/P3 (xFallaCoherencia = FALSE)', () => {
    const invalidas = [...palabrasObservadas.keys()].filter((p) => !(p in ESTADOS));
    assert.deepEqual(invalidas, [], `palabras fuera de λ: ${invalidas.join(', ')}`);
    assert.equal(palabrasObservadas.size, 6, 'no se recorrieron los seis estados');
  });
});
