// Protocolo CP-01…CP-24 ejecutado como maestro Modbus TCP (Contrato v1.2.0)
// y prueba determinista directa sobre FB_ClasificadorFSM (IEC 61131-3).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as esperar } from 'node:timers/promises';
import ModbusRTU from 'modbus-serial';
import { E_EstadoClasificador, E_ModoRuteo, FB_ClasificadorFSM } from '../src/clasificador.js';
import { PlcVirtual } from '../src/plcVirtual.js';

const EXTERNO = Boolean(process.env.PLC_HOST);
const HOST = process.env.PLC_HOST ?? '127.0.0.1';
const PORT = Number(process.env.PLC_PORT ?? (EXTERNO ? 5020 : 15020));
const UNIT_ID = Number(process.env.PLC_UNIT_ID ?? 1);

const T_PULSO = 150;
const T_CLAS = 4000;
const T_SONDEO = 20;
const T_REACCION = 150;

const [MARCHA, PARADA, EMERGENCIA, SENSOR, SELECTOR, ESTIBA_A, ESTIBA_B, SALIDA_A, SALIDA_B, ATASCO] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const N_COILS = 10;

// Palabra base (q0 q1 q2 q3 q4 q6) y extensión (q8 alarmaAtasco, q9 avisoNoRead)
const ESTADOS = {
  '000000': 'REPOSO',
  '100000': 'ESPERANDO_PAQUETE',
  '101000': 'CLASIFICANDO_RUTA_A',
  '110100': 'CLASIFICANDO_RUTA_B',
  '000010': 'PARADA_EMERGENCIA',
  '000001': 'ESPERANDO_CAMBIO_ESTIBA',
};

const cliente = new ModbusRTU();
const palabrasObservadas = new Map();
let plc = null;

async function leerSalidas() {
  const { data } = await cliente.readDiscreteInputs(0, 11);
  const palabra = [...data.slice(0, 5), data[6]].map(Number).join('');
  palabrasObservadas.set(palabra, (palabrasObservadas.get(palabra) ?? 0) + 1);
  let estado = ESTADOS[palabra] ?? 'ESTADO_INDETERMINADO';
  if (estado === 'PARADA_EMERGENCIA' && data[8]) estado = 'FALLA_ATASCO';
  if (estado === 'ESPERANDO_CAMBIO_ESTIBA' && data[9]) estado = 'INSPECCION_NO_READ';
  return { palabra, estado, heartbeat: data[5], stopper: data[7], raw: data };
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

async function reiniciar() {
  await cliente.writeCoils(0, Array(N_COILS).fill(false));
  await cliente.writeRegisters(0, [0, 0, 0, T_CLAS]);
  await esperar(T_PULSO);
  if ((await leerSalidas()).estado !== 'REPOSO') await pulso(PARADA);
  await esperarEstado('REPOSO', 500);
}

async function enEspera() {
  await reiniciar();
  await pulso(MARCHA);
  await esperarEstado('ESPERANDO_PAQUETE', T_REACCION);
}

async function clasificando(rutaB) {
  await enEspera();
  await fijar(SELECTOR, rutaB);
  await fijar(SENSOR, true);
  const tFlanco = performance.now();
  await esperarEstado(rutaB ? 'CLASIFICANDO_RUTA_B' : 'CLASIFICANDO_RUTA_A', T_REACCION);
  await fijar(SENSOR, false);
  return tFlanco;
}

// Pruebas deterministas del bloque funcional IEC 61131-3 en memoria (sin red)
describe('Bloque Funcional FB_ClasificadorFSM (IEC 61131-3 puro)', () => {
  test('Cierre de lazo en Salida A/B, Watchdog de Atasco (S6) y Pausa NO_READ (S7)', () => {
    const fb = new FB_ClasificadorFSM();
    let t = 0;
    const scan = (entradas) => {
      t += 10;
      fb.ejecutar(entradas, t);
    };

    // 1. Arranque a EN_MARCHA_ESPERA
    scan({ xMarcha: true });
    scan({ xMarcha: false });
    assert.equal(fb.eEstado, E_EstadoClasificador.EN_MARCHA_ESPERA);
    assert.equal(fb.xBalizaVerde, true);

    // 2. Modo Auto-Escáner con SKU-B (2) y confirmación temprana por Sensor_Salida_B (%IX1.0)
    scan({ uiModoRuteo: E_ModoRuteo.AUTO_ESCANER, uiSkuEscaneado: 2, xSensor: true });
    assert.equal(fb.eEstado, E_EstadoClasificador.CLASIFICANDO_RUTA_B);
    assert.equal(fb.xStopperAdmision, true);
    scan({ xSensor: false });
    scan({ xSensorSalidaB: true });
    assert.equal(fb.eEstado, E_EstadoClasificador.EN_MARCHA_ESPERA, 'cierra el lazo antes de 4 s');
    assert.equal(fb.xStopperAdmision, false);
    assert.equal(fb.udiPaquetesB, 1);
    scan({ xSensorSalidaB: false });

    // 3. Código ilegible NO_READ (99) → S7 INSPECCION_NO_READ → asignación manual Ruta A
    scan({ uiSkuEscaneado: 99, xSensor: true });
    assert.equal(fb.eEstado, E_EstadoClasificador.INSPECCION_NO_READ);
    assert.equal(fb.xAvisoNoRead, true);
    assert.equal(fb.uiCodigoFalla, 4);
    scan({ xSensor: false, xSelectorB: false, xMarcha: true });
    assert.equal(fb.eEstado, E_EstadoClasificador.CLASIFICANDO_RUTA_A);
    scan({ xMarcha: false, xSensorSalidaA: true });
    assert.equal(fb.eEstado, E_EstadoClasificador.EN_MARCHA_ESPERA);
    scan({ xSensorSalidaA: false });

    // 4. Watchdog de Atasco vencido (uiModoWatchdog = 1) → S6 FALLA_ATASCO → rearme consciente
    scan({ uiModoWatchdog: 1, uiSkuEscaneado: 1, xSensor: true });
    scan({ xSensor: false }); // flancoIN de TON_Clasif en S2
    t += 4000;
    fb.ejecutar({}, t);
    assert.equal(fb.eEstado, E_EstadoClasificador.FALLA_ATASCO);
    assert.equal(fb.xAlarmaAtasco, true);
    assert.equal(fb.uiCodigoFalla, 3);
    assert.equal(fb.udiAtascos, 1);
    scan({ xParada: true });
    assert.equal(fb.eEstado, E_EstadoClasificador.REPOSO);
  });
});

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

describe(`Contrato Modbus v1.2.0 · ${EXTERNO ? 'esclavo externo' : 'PLC virtual'} ${HOST}:${PORT}`, () => {
  test('FC01 devuelve las órdenes efectivamente presentes en el PLC (readback)', async () => {
    await reiniciar();
    await fijar(SELECTOR, true);
    const { data } = await cliente.readCoils(0, 7);
    assert.deepEqual(data.slice(0, 7), [false, false, false, false, true, false, false]);
    await fijar(SELECTOR, false);
  });
});

describe('Protocolo CP-01 … CP-24', () => {
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
    await mantieneEstado('REPOSO', 500);
    await fijar(MARCHA, false);
    await esperar(T_PULSO);
    await pulso(MARCHA);
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
    await fijar(MARCHA, true);
    await esperarEstado('ESPERANDO_PAQUETE', T_REACCION);
    await fijar(ESTIBA_B, true);
    await esperarEstado('ESPERANDO_CAMBIO_ESTIBA', T_REACCION);
    await fijar(ESTIBA_B, false);
    await esperarEstado('REPOSO', T_REACCION);
    await mantieneEstado('REPOSO', 400);
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
  });

  test('CP-20 · cierre de lazo por fotocelda de salida (%IX0.7 / %IX1.0) libera la línea antes de T_clas (T6a/T6b)', async () => {
    await clasificando(false);
    await esperar(300);
    await pulso(SALIDA_A);
    await esperarEstado('ESPERANDO_PAQUETE', T_REACCION);
  });

  test('CP-21 · atasco en banda o watchdog estricto sin salida dispara FALLA_ATASCO (T11) y rearma con Parada (T12)', async () => {
    await enEspera();
    await cliente.writeRegister(3, 1200); // Watchdog 1,2 s
    await fijar(ATASCO, true);
    await pulso(SENSOR);
    await esperarEstado('FALLA_ATASCO', 1800);
    await fijar(ATASCO, false);
    await pulso(PARADA);
    await esperarEstado('REPOSO', T_REACCION);
  });

  test('CP-22 · modo Auto-Escáner (%MW0=1) con código NO_READ (%MW1=99) pausa en INSPECCION_NO_READ y despacha tras Marcha', async () => {
    await enEspera();
    await cliente.writeRegisters(0, [1, 99, 0, T_CLAS]);
    await pulso(SENSOR);
    await esperarEstado('INSPECCION_NO_READ', T_REACCION);
    await fijar(SELECTOR, true);
    await pulso(MARCHA);
    await esperarEstado('CLASIFICANDO_RUTA_B', T_REACCION);
    await pulso(SALIDA_B);
    await esperarEstado('ESPERANDO_PAQUETE', T_REACCION);
  });

  test('CP-14 · ninguna palabra de salida observada viola P2/P3 (xFallaCoherencia = FALSE)', () => {
    assert.ok(palabrasObservadas.size > 0);
    for (const palabra of palabrasObservadas.keys()) {
      assert.ok(palabra in ESTADOS, `palabra inválida observada: ${palabra}`);
    }
  });
});
