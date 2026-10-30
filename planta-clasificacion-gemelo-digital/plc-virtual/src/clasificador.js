// Traducción 1:1 de plc-codesys/ a JavaScript (Contrato v1.2.0). Fuente de verdad: los .st.
// Cualquier cambio en ellos debe replicarse aquí; test/cp.test.js detecta la
// divergencia porque ejecuta el mismo protocolo contra ambos PLC.
import { TON, R_TRIG } from './iec61131.js';

// variables_globales.st [1] · DUT E_EstadoClasificador (S0..S7)
export const E_EstadoClasificador = Object.freeze({
  REPOSO: 0,
  EN_MARCHA_ESPERA: 1,
  CLASIFICANDO_RUTA_A: 2,
  CLASIFICANDO_RUTA_B: 3,
  PARADA_EMERGENCIA: 4,
  ESPERANDO_CAMBIO_ESTIBA: 5,
  FALLA_ATASCO: 6,
  INSPECCION_NO_READ: 7,
});

// variables_globales.st [2] · DUT E_ModoRuteo
export const E_ModoRuteo = Object.freeze({
  MANUAL: 0,
  AUTO_ESCANER: 1,
  AUTO_BALANCEO: 2,
});

export const nombreEstado = (e) =>
  Object.keys(E_EstadoClasificador).find((k) => E_EstadoClasificador[k] === e) ?? `FUERA_DE_DOMINIO(${e})`;

// variables_globales.st [4] · GVL_Param (TIME en ms)
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
  // VAR_INPUT (%IX y %MW)
  xMarcha = false;
  xParada = false;
  xEmergencia = false;
  xSensor = false;
  xSelectorB = false;
  xEstibaLlenaA = false;
  xEstibaLlenaB = false;
  xSensorSalidaA = false;
  xSensorSalidaB = false;
  xAtascoPlanta = false;
  uiModoRuteo = E_ModoRuteo.MANUAL;
  uiSkuEscaneado = 0;
  uiModoWatchdog = 0;
  tClasificacion = 4000;

  // VAR_OUTPUT (%QX y %IW)
  xCintaEntrada = false;
  xDesviador = false;
  xCintaSalidaA = false;
  xCintaSalidaB = false;
  xBaliza = false;
  xSenalCambioEstiba = false;
  xStopperAdmision = false;
  xAlarmaAtasco = false;
  xAvisoNoRead = false;
  xBalizaVerde = false;
  eEstado = E.REPOSO;
  xFallaCoherencia = false;
  uiCodigoFalla = 0;
  udiPaquetesA = 0;
  udiPaquetesB = 0;
  udiAtascos = 0;
  udiNoRead = 0;
  uiTiempoClasifMs = 0;
  uiUltimoSku = 0;

  // VAR internas
  rtMarcha = new R_TRIG();
  rtSensor = new R_TRIG();
  rtSalidaA = new R_TRIG();
  rtSalidaB = new R_TRIG();
  TON_Clasif = new TON();
  xTurnoBalanceoB = false;

  ejecutar(entradas, ahora) {
    Object.assign(this, entradas);

    // (a) Flancos ascendentes, siempre (P4)
    this.rtMarcha.ejecutar({ CLK: this.xMarcha });
    this.rtSensor.ejecutar({ CLK: this.xSensor });
    this.rtSalidaA.ejecutar({ CLK: this.xSensorSalidaA });
    this.rtSalidaB.ejecutar({ CLK: this.xSensorSalidaB });

    // (b) Temporizador / Watchdog de clasificación sobre el estado vigente
    this.TON_Clasif.ejecutar({
      IN: this.eEstado === E.CLASIFICANDO_RUTA_A || this.eEstado === E.CLASIFICANDO_RUTA_B,
      PT: this.tClasificacion,
    }, ahora);
    this.uiTiempoClasifMs = Math.round(this.TON_Clasif.ET);

    // (c) Función de transición δ · Emergencia ≻ Estiba no disponible ≻ Parada ≻ Proceso
    if (this.xEmergencia) {                                        // T1 · ∀s → S4
      this.eEstado = E.PARADA_EMERGENCIA;
    } else if ((this.xEstibaLlenaA || this.xEstibaLlenaB)
               && this.eEstado !== E.PARADA_EMERGENCIA
               && this.eEstado !== E.FALLA_ATASCO) {               // T9 · S0..S3, S7 → S5 (P6)
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
          } else if (this.rtSensor.Q) {                            // Muestreo de destino en s↑ (P5)
            if (this.uiModoRuteo === E_ModoRuteo.AUTO_ESCANER) {
              this.uiUltimoSku = this.uiSkuEscaneado;
              if (this.uiSkuEscaneado === 99) {                    // T13 · Código ilegible → S7
                this.eEstado = E.INSPECCION_NO_READ;
                this.udiNoRead += 1;
              } else if (this.uiSkuEscaneado === 2) {
                this.eEstado = E.CLASIFICANDO_RUTA_B;
                this.udiPaquetesB += 1;
              } else {
                this.eEstado = E.CLASIFICANDO_RUTA_A;
                this.udiPaquetesA += 1;
              }
            } else if (this.uiModoRuteo === E_ModoRuteo.AUTO_BALANCEO) {
              const irB = this.xTurnoBalanceoB;
              this.xTurnoBalanceoB = !this.xTurnoBalanceoB;
              this.uiUltimoSku = irB ? 2 : 1;
              if (irB) {
                this.eEstado = E.CLASIFICANDO_RUTA_B;
                this.udiPaquetesB += 1;
              } else {
                this.eEstado = E.CLASIFICANDO_RUTA_A;
                this.udiPaquetesA += 1;
              }
            } else {                                               // Modo 0: MANUAL (%IX0.4)
              this.uiUltimoSku = this.xSelectorB ? 2 : 1;
              if (this.xSelectorB) {                               // T5
                this.eEstado = E.CLASIFICANDO_RUTA_B;
                this.udiPaquetesB += 1;
              } else {                                             // T4
                this.eEstado = E.CLASIFICANDO_RUTA_A;
                this.udiPaquetesA += 1;
              }
            }
          }
          break;

        case E.CLASIFICANDO_RUTA_A:
          if (this.xParada) {                                      // T7
            this.eEstado = E.REPOSO;
          } else if (this.rtSalidaA.Q && !this.xAtascoPlanta) {    // T6a · Cierre de lazo en salida A
            this.eEstado = E.EN_MARCHA_ESPERA;
          } else if (this.TON_Clasif.Q) {
            if (this.xAtascoPlanta || this.uiModoWatchdog === 1) { // T11 · Watchdog vencido → S6
              this.eEstado = E.FALLA_ATASCO;
              this.udiAtascos += 1;
            } else {                                               // T6 · Lazo abierto clásico
              this.eEstado = E.EN_MARCHA_ESPERA;
            }
          }
          break;

        case E.CLASIFICANDO_RUTA_B:
          if (this.xParada) {                                      // T7
            this.eEstado = E.REPOSO;
          } else if (this.rtSalidaB.Q && !this.xAtascoPlanta) {    // T6b · Cierre de lazo en salida B
            this.eEstado = E.EN_MARCHA_ESPERA;
          } else if (this.TON_Clasif.Q) {
            if (this.xAtascoPlanta || this.uiModoWatchdog === 1) { // T11 · Watchdog vencido → S6
              this.eEstado = E.FALLA_ATASCO;
              this.udiAtascos += 1;
            } else {                                               // T6 · Lazo abierto clásico
              this.eEstado = E.EN_MARCHA_ESPERA;
            }
          }
          break;

        case E.PARADA_EMERGENCIA:
          if (this.xParada) {                                      // T8 · rearme consciente
            this.eEstado = E.REPOSO;
          }
          break;

        case E.ESPERANDO_CAMBIO_ESTIBA:
          this.eEstado = E.REPOSO;                                 // T10 · exige Marcha (P7)
          break;

        case E.FALLA_ATASCO:
          if (this.xParada && !this.xAtascoPlanta) {               // T12 · rearme tras despejar atasco
            this.eEstado = E.REPOSO;
          }
          break;

        case E.INSPECCION_NO_READ:
          if (this.xParada) {
            this.eEstado = E.REPOSO;
          } else if (this.rtMarcha.Q) {                            // T14 · asignación manual A/B + Marcha
            if (this.xSelectorB) {
              this.uiUltimoSku = 2;
              this.eEstado = E.CLASIFICANDO_RUTA_B;
              this.udiPaquetesB += 1;
            } else {
              this.uiUltimoSku = 1;
              this.eEstado = E.CLASIFICANDO_RUTA_A;
              this.udiPaquetesA += 1;
            }
          }
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
    this.xBaliza = s === E.PARADA_EMERGENCIA || s === E.FALLA_ATASCO;
    this.xSenalCambioEstiba = s === E.ESPERANDO_CAMBIO_ESTIBA || s === E.INSPECCION_NO_READ;
    this.xStopperAdmision = s === E.CLASIFICANDO_RUTA_A
      || s === E.CLASIFICANDO_RUTA_B
      || s === E.INSPECCION_NO_READ
      || s === E.FALLA_ATASCO;
    this.xAlarmaAtasco = s === E.FALLA_ATASCO;
    this.xAvisoNoRead = s === E.INSPECCION_NO_READ;
    this.xBalizaVerde = this.xCintaEntrada;

    // (e) Invariantes: P2 □¬(Q2 ∧ Q3) ;  P3 □(Q1 ↔ Q3) y código de falla
    this.xFallaCoherencia = (this.xCintaSalidaA && this.xCintaSalidaB) || this.xDesviador !== this.xCintaSalidaB;

    if (this.xFallaCoherencia) this.uiCodigoFalla = 5;
    else if (s === E.PARADA_EMERGENCIA) this.uiCodigoFalla = 1;
    else if (s === E.ESPERANDO_CAMBIO_ESTIBA) this.uiCodigoFalla = 2;
    else if (s === E.FALLA_ATASCO) this.uiCodigoFalla = 3;
    else if (s === E.INSPECCION_NO_READ) this.uiCodigoFalla = 4;
    else this.uiCodigoFalla = 0;
  }
}
