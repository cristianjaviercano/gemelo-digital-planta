// Traducción 1:1 de plc-codesys/ a JavaScript. Fuente de verdad: los .st.
// Cualquier cambio en ellos debe replicarse aquí; test/cp.test.js detecta la
// divergencia porque ejecuta el mismo protocolo CP-01…CP-19 contra ambos PLC.
import { TON, R_TRIG } from './iec61131.js';

// variables_globales.st [1] · DUT E_EstadoClasificador
export const E_EstadoClasificador = Object.freeze({
  REPOSO: 0,
  EN_MARCHA_ESPERA: 1,
  CLASIFICANDO_RUTA_A: 2,
  CLASIFICANDO_RUTA_B: 3,
  PARADA_EMERGENCIA: 4,
  ESPERANDO_CAMBIO_ESTIBA: 5,
});

export const nombreEstado = (e) =>
  Object.keys(E_EstadoClasificador).find((k) => E_EstadoClasificador[k] === e) ?? `FUERA_DE_DOMINIO(${e})`;

// variables_globales.st [3] · GVL_Param (TIME en ms)
export const GVL_Param = Object.freeze({
  T_HEARTBEAT: 500,
  T_CLASIFICACION: 4000,
});

const E = E_EstadoClasificador;

// logica_clasificador_fsm.st [1]
export class FB_Heartbeat {
  tSemiperiodo = 500;
  xPulso = false;
  Heartbeat_Timer = new TON();

  ejecutar(entradas, ahora) {
    Object.assign(this, entradas);
    this.Heartbeat_Timer.ejecutar({ IN: !this.Heartbeat_Timer.Q, PT: this.tSemiperiodo }, ahora);
    if (this.Heartbeat_Timer.Q) this.xPulso = !this.xPulso;
  }
}

// logica_clasificador_fsm.st [2] · mismo orden de evaluación (a)…(e) por ciclo
export class FB_ClasificadorFSM {
  // VAR_INPUT
  xMarcha = false;
  xParada = false;
  xEmergencia = false;
  xSensor = false;
  xSelectorB = false;
  xEstibaLlenaA = false;
  xEstibaLlenaB = false;
  tClasificacion = 4000;
  // VAR_OUTPUT
  xCintaEntrada = false;
  xDesviador = false;
  xCintaSalidaA = false;
  xCintaSalidaB = false;
  xBaliza = false;
  xSenalCambioEstiba = false;
  eEstado = E.REPOSO;
  xFallaCoherencia = false;
  udiPaquetesA = 0;
  udiPaquetesB = 0;
  // VAR
  rtMarcha = new R_TRIG();
  rtSensor = new R_TRIG();
  TON_Clasif = new TON();

  ejecutar(entradas, ahora) {
    Object.assign(this, entradas);

    // (a) Flancos ascendentes, siempre (P4)
    this.rtMarcha.ejecutar({ CLK: this.xMarcha });
    this.rtSensor.ejecutar({ CLK: this.xSensor });

    // (b) Temporizador de clasificación sobre el estado vigente
    this.TON_Clasif.ejecutar({
      IN: this.eEstado === E.CLASIFICANDO_RUTA_A || this.eEstado === E.CLASIFICANDO_RUTA_B,
      PT: this.tClasificacion,
    }, ahora);

    // (c) Función de transición δ · Emergencia ≻ Estiba no disponible ≻ Parada ≻ resto
    if (this.xEmergencia) {                                        // T1 · ∀s
      this.eEstado = E.PARADA_EMERGENCIA;
    } else if ((this.xEstibaLlenaA || this.xEstibaLlenaB)
               && this.eEstado !== E.PARADA_EMERGENCIA) {          // T9 · S0..S3 → S5 (P6)
      this.eEstado = E.ESPERANDO_CAMBIO_ESTIBA;
    } else {
      switch (this.eEstado) {
        case E.REPOSO:
          if (!this.xParada && this.rtMarcha.Q) {                  // T2
            this.eEstado = E.EN_MARCHA_ESPERA;
          }
          break;

        case E.EN_MARCHA_ESPERA:
          if (this.xParada) {                                      // T3
            this.eEstado = E.REPOSO;
          } else if (this.rtSensor.Q) {                            // d se muestrea solo aquí (P5)
            if (this.xSelectorB) {                                 // T5
              this.eEstado = E.CLASIFICANDO_RUTA_B;
              this.udiPaquetesB += 1;
            } else {                                               // T4
              this.eEstado = E.CLASIFICANDO_RUTA_A;
              this.udiPaquetesA += 1;
            }
          }
          break;

        case E.CLASIFICANDO_RUTA_A:
        case E.CLASIFICANDO_RUTA_B:
          if (this.xParada) {                                      // T7
            this.eEstado = E.REPOSO;
          } else if (this.TON_Clasif.Q) {                          // T6
            this.eEstado = E.EN_MARCHA_ESPERA;
          }                                                        // s↑ ignorado: H1
          break;

        case E.PARADA_EMERGENCIA:
          if (this.xParada) {                                      // T8 · rearme consciente
            this.eEstado = E.REPOSO;
          }
          break;

        case E.ESPERANDO_CAMBIO_ESTIBA:
          // Solo se llega con ambas estibas disponibles: la rama T9 captura ℓ
          this.eEstado = E.REPOSO;                                 // T10 · exige Marcha (P7)
          break;

        default:                                                   // fuera de dominio: fallo seguro
          this.eEstado = E.PARADA_EMERGENCIA;
      }
    }

    // (d) Función de salida λ (Moore)
    const s = this.eEstado;
    this.xCintaEntrada = s === E.EN_MARCHA_ESPERA || s === E.CLASIFICANDO_RUTA_A || s === E.CLASIFICANDO_RUTA_B;
    this.xDesviador = s === E.CLASIFICANDO_RUTA_B;
    this.xCintaSalidaA = s === E.CLASIFICANDO_RUTA_A;
    this.xCintaSalidaB = s === E.CLASIFICANDO_RUTA_B;
    this.xBaliza = s === E.PARADA_EMERGENCIA;
    this.xSenalCambioEstiba = s === E.ESPERANDO_CAMBIO_ESTIBA;

    // (e) Invariantes: P2 □¬(Q2 ∧ Q3) ;  P3 □(Q1 ↔ Q3)
    this.xFallaCoherencia = (this.xCintaSalidaA && this.xCintaSalidaB) || this.xDesviador !== this.xCintaSalidaB;
  }
}
