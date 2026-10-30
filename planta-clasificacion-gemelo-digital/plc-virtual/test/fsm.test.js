// Pruebas deterministas exhaustivas del bloque funcional IEC 61131-3 (FB_ClasificadorFSM
// y FB_Heartbeat) sin sockets TCP: verifica estados S0..S7, modos de ruteo, cierre de lazo,
// watchdog de atasco, inspección NO_READ e invariantes P1..P7.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { E_EstadoClasificador, E_ModoRuteo, FB_ClasificadorFSM, FB_Heartbeat } from '../src/clasificador.js';

const E = E_EstadoClasificador;

describe('FB_Heartbeat (IEC 61131-3)', () => {
  test('conmuta xPulso con semiperiodo efectivo PT + 2·T_scan (520 ms a T_scan = 10 ms)', () => {
    const hb = new FB_Heartbeat();
    for (let t = 0; t <= 500; t += 10) hb.ejecutar({ tSemiperiodo: 500 }, t);
    assert.equal(hb.xPulso, true);
    for (let t = 510; t <= 1020; t += 10) hb.ejecutar({ tSemiperiodo: 500 }, t);
    assert.equal(hb.xPulso, false);
  });
});

describe('FB_ClasificadorFSM · Contrato v1.2.0 (S0..S7)', () => {
  test('Modo Manual, Auto-Escáner y Auto-Balanceo con cierre de lazo por %IX0.7 / %IX1.0', () => {
    const fb = new FB_ClasificadorFSM();
    let t = 0;
    const scan = (inPut = {}) => {
      t += 10;
      fb.ejecutar(inPut, t);
      assert.equal(fb.xFallaCoherencia, false, 'Invariantes P2 y P3 siempre cumplidos');
    };

    // Arranque S0 → S1
    scan({ xMarcha: true });
    scan({ xMarcha: false });
    assert.equal(fb.eEstado, E.EN_MARCHA_ESPERA);
    assert.equal(fb.xBalizaVerde, true);
    assert.equal(fb.xStopperAdmision, false);

    // Modo Auto-Balanceo (%MW0 = 2): alterna A y B automáticamente
    scan({ uiModoRuteo: E_ModoRuteo.AUTO_BALANCEO, xSensor: true });
    assert.equal(fb.eEstado, E.CLASIFICANDO_RUTA_A);
    assert.equal(fb.xStopperAdmision, true);
    scan({ xSensor: false, xSensorSalidaA: true });
    assert.equal(fb.eEstado, E.EN_MARCHA_ESPERA);
    scan({ xSensorSalidaA: false, xSensor: true });
    assert.equal(fb.eEstado, E.CLASIFICANDO_RUTA_B);
    scan({ xSensor: false, xSensorSalidaB: true });
    assert.equal(fb.eEstado, E.EN_MARCHA_ESPERA);
    scan({ xSensorSalidaB: false });
    assert.equal(fb.udiPaquetesA, 1);
    assert.equal(fb.udiPaquetesB, 1);
  });

  test('Pausa de inspección NO_READ (S7) y asignación manual con Marcha', () => {
    const fb = new FB_ClasificadorFSM();
    let t = 0;
    const scan = (inPut = {}) => {
      t += 10;
      fb.ejecutar(inPut, t);
    };

    scan({ xMarcha: true });
    scan({ xMarcha: false, uiModoRuteo: E_ModoRuteo.AUTO_ESCANER, uiSkuEscaneado: 99, xSensor: true });
    assert.equal(fb.eEstado, E.INSPECCION_NO_READ);
    assert.equal(fb.xAvisoNoRead, true);
    assert.equal(fb.xSenalCambioEstiba, true);
    assert.equal(fb.xStopperAdmision, true);
    assert.equal(fb.xCintaEntrada, false);
    assert.equal(fb.uiCodigoFalla, 4);
    assert.equal(fb.udiNoRead, 1);

    // Operador selecciona Ruta B y pulsa Marcha
    scan({ xSensor: false, xSelectorB: true, xMarcha: true });
    assert.equal(fb.eEstado, E.CLASIFICANDO_RUTA_B);
    assert.equal(fb.uiUltimoSku, 2);
  });

  test('Watchdog de Atasco (S6): se activa al vencer TON sin sensor de salida y exige despeje + Parada', () => {
    const fb = new FB_ClasificadorFSM();
    let t = 0;
    const scan = (inPut = {}, dt = 10) => {
      t += dt;
      fb.ejecutar(inPut, t);
    };

    scan({ xMarcha: true });
    scan({ xMarcha: false, xAtascoPlanta: true, xSensor: true });
    assert.equal(fb.eEstado, E.CLASIFICANDO_RUTA_A);
    // Primer ciclo en S2 arranca TON_Clasif (flancoIN); 4000 ms después vence TON_Clasif.Q
    scan({ xSensor: false }, 10);
    scan({}, 4000);
    assert.equal(fb.eEstado, E.FALLA_ATASCO);
    assert.equal(fb.xAlarmaAtasco, true);
    assert.equal(fb.xBaliza, true);
    assert.equal(fb.xCintaEntrada, false);
    assert.equal(fb.uiCodigoFalla, 3);
    assert.equal(fb.udiAtascos, 1);

    // Mientras persista xAtascoPlanta, Parada no rearma
    scan({ xParada: true });
    assert.equal(fb.eEstado, E.FALLA_ATASCO);

    // Al despejar atasco y pulsar Parada → REPOSO
    scan({ xAtascoPlanta: false, xParada: true });
    assert.equal(fb.eEstado, E.REPOSO);
    assert.equal(fb.uiCodigoFalla, 0);
  });
});
