// Motor FSM Local IEC 61131-3 (Standalone Web Showcase Mode · Contrato v1.2.0):
// Ejecuta el mismo bloque funcional FB_ClasificadorFSM (estados S0..S7, TON, R_TRIG,
// Coils, Discrete Inputs, Holding Registers e Input Registers) en el navegador.
import { GEOMETRIA } from './plantModel.js';

const T_CLASIFICACION_DEFECTO_MS = GEOMETRIA.tClasificacion * 1000;

const E = Object.freeze({
  REPOSO: 0,
  EN_MARCHA_ESPERA: 1,
  CLASIFICANDO_RUTA_A: 2,
  CLASIFICANDO_RUTA_B: 3,
  PARADA_EMERGENCIA: 4,
  ESPERANDO_CAMBIO_ESTIBA: 5,
  FALLA_ATASCO: 6,
  INSPECCION_NO_READ: 7,
});

const STATUS_DE_ESTADO = Object.freeze({
  [E.REPOSO]: 'REPOSO',
  [E.EN_MARCHA_ESPERA]: 'ESPERANDO_PAQUETE',
  [E.CLASIFICANDO_RUTA_A]: 'CLASIFICANDO_RUTA_A',
  [E.CLASIFICANDO_RUTA_B]: 'CLASIFICANDO_RUTA_B',
  [E.PARADA_EMERGENCIA]: 'PARADA_EMERGENCIA',
  [E.ESPERANDO_CAMBIO_ESTIBA]: 'ESPERANDO_CAMBIO_ESTIBA',
  [E.FALLA_ATASCO]: 'FALLA_ATASCO',
  [E.INSPECCION_NO_READ]: 'INSPECCION_NO_READ',
});

export class FsmLocalPLC extends EventTarget {
  conectado = true;
  ultimoEstado = null;
  modoAutonomo = true;

  #eEstado = E.REPOSO;
  #tiempoClasifMs = 0;
  #timerHeartbeat = 0;
  #heartbeatBit = false;
  #turnoBalanceoB = false;

  // Coils 0..9 (%IX0.0..1.1)
  #inputs = {
    marcha: false,
    parada: false,
    emergencia: false,
    sensorEntrada: false,
    selectorDestinoB: false,
    estibaLlenaA: false,
    estibaLlenaB: false,
    sensorSalidaA: false,
    sensorSalidaB: false,
    atascoEnBanda: false,
  };

  // Holding Registers 0..3 (%MW0..3)
  #holdingRegisters = {
    modoRuteo: 0,
    skuEscaneado: 0,
    modoWatchdog: 0,
    tiempoWatchdogMs: T_CLASIFICACION_DEFECTO_MS,
  };

  // Contadores y diagnóstico internos (%IW)
  #paquetesA = 0;
  #paquetesB = 0;
  #atascos = 0;
  #noRead = 0;
  #ultimoSku = 0;

  // Memoria de flancos R_TRIG
  #prevMarcha = false;
  #prevSensor = false;
  #prevSalidaA = false;
  #prevSalidaB = false;
  #intervaloId = null;

  constructor() {
    super();
    this.#iniciarCiclo();
  }

  destruir() {
    if (this.#intervaloId) clearInterval(this.#intervaloId);
  }

  enviar(comando) {
    const { target, action, value } = comando;
    if (!target) return false;

    if (action === 'pulse') {
      if (target === 'marcha' || target === 'parada') {
        this.#inputs[target] = true;
        setTimeout(() => {
          this.#inputs[target] = false;
        }, 150);
      }
    } else if (action === 'set') {
      if (typeof value === 'boolean' && target in this.#inputs) {
        this.#inputs[target] = value;
      }
    } else if (action === 'write') {
      if (typeof value === 'number' && Number.isInteger(value) && target in this.#holdingRegisters) {
        this.#holdingRegisters[target] = value;
      }
    }

    this.dispatchEvent(new CustomEvent('ack', { detail: { type: 'ack', target, ok: true } }));
    return true;
  }

  #iniciarCiclo() {
    const SCAN_MS = 50;
    this.#intervaloId = setInterval(() => {
      this.#cicloScan(SCAN_MS);
    }, SCAN_MS);

    setTimeout(() => {
      this.dispatchEvent(new CustomEvent('conexion', { detail: { conectado: true, modo: 'autonomo' } }));
    }, 80);
  }

  #cicloScan(dtMs) {
    this.#timerHeartbeat = (this.#timerHeartbeat + dtMs) % 1000;
    this.#heartbeatBit = this.#timerHeartbeat < 500;

    const {
      marcha, parada, emergencia, sensorEntrada, selectorDestinoB,
      estibaLlenaA, estibaLlenaB, sensorSalidaA, sensorSalidaB, atascoEnBanda,
    } = this.#inputs;
    const { modoRuteo, skuEscaneado, modoWatchdog, tiempoWatchdogMs } = this.#holdingRegisters;
    const ptWatchdog = tiempoWatchdogMs >= 1000 && tiempoWatchdogMs <= 15000 ? tiempoWatchdogMs : T_CLASIFICACION_DEFECTO_MS;

    // (a) R_TRIG siempre evaluados (P4)
    const rtMarcha = marcha && !this.#prevMarcha;
    const rtSensor = sensorEntrada && !this.#prevSensor;
    const rtSalidaA = sensorSalidaA && !this.#prevSalidaA;
    const rtSalidaB = sensorSalidaB && !this.#prevSalidaB;
    this.#prevMarcha = marcha;
    this.#prevSensor = sensorEntrada;
    this.#prevSalidaA = sensorSalidaA;
    this.#prevSalidaB = sensorSalidaB;

    // (b) TON_Clasif sobre el estado vigente
    const enClasif = this.#eEstado === E.CLASIFICANDO_RUTA_A || this.#eEstado === E.CLASIFICANDO_RUTA_B;
    this.#tiempoClasifMs = enClasif ? Math.min(this.#tiempoClasifMs + dtMs, ptWatchdog) : 0;
    const tonQ = enClasif && this.#tiempoClasifMs >= ptWatchdog;

    // (c) Función de transición δ idéntica a FB_ClasificadorFSM
    if (emergencia) {
      this.#eEstado = E.PARADA_EMERGENCIA;
    } else if ((estibaLlenaA || estibaLlenaB)
               && this.#eEstado !== E.PARADA_EMERGENCIA
               && this.#eEstado !== E.FALLA_ATASCO) {
      this.#eEstado = E.ESPERANDO_CAMBIO_ESTIBA;
    } else {
      switch (this.#eEstado) {
        case E.REPOSO:
          if (!parada && rtMarcha) this.#eEstado = E.EN_MARCHA_ESPERA;
          break;

        case E.EN_MARCHA_ESPERA:
          if (parada) {
            this.#eEstado = E.REPOSO;
          } else if (rtSensor) {
            if (modoRuteo === 1) {
              this.#ultimoSku = skuEscaneado;
              if (skuEscaneado === 99) {
                this.#eEstado = E.INSPECCION_NO_READ;
                this.#noRead += 1;
              } else if (skuEscaneado === 2) {
                this.#eEstado = E.CLASIFICANDO_RUTA_B;
                this.#paquetesB += 1;
              } else {
                this.#eEstado = E.CLASIFICANDO_RUTA_A;
                this.#paquetesA += 1;
              }
            } else if (modoRuteo === 2) {
              const irB = this.#turnoBalanceoB;
              this.#turnoBalanceoB = !this.#turnoBalanceoB;
              this.#ultimoSku = irB ? 2 : 1;
              if (irB) {
                this.#eEstado = E.CLASIFICANDO_RUTA_B;
                this.#paquetesB += 1;
              } else {
                this.#eEstado = E.CLASIFICANDO_RUTA_A;
                this.#paquetesA += 1;
              }
            } else {
              this.#ultimoSku = selectorDestinoB ? 2 : 1;
              if (selectorDestinoB) {
                this.#eEstado = E.CLASIFICANDO_RUTA_B;
                this.#paquetesB += 1;
              } else {
                this.#eEstado = E.CLASIFICANDO_RUTA_A;
                this.#paquetesA += 1;
              }
            }
          }
          break;

        case E.CLASIFICANDO_RUTA_A:
          if (parada) {
            this.#eEstado = E.REPOSO;
          } else if (rtSalidaA && !atascoEnBanda) {
            this.#eEstado = E.EN_MARCHA_ESPERA;
          } else if (tonQ) {
            if (atascoEnBanda || modoWatchdog === 1) {
              this.#eEstado = E.FALLA_ATASCO;
              this.#atascos += 1;
            } else {
              this.#eEstado = E.EN_MARCHA_ESPERA;
            }
          }
          break;

        case E.CLASIFICANDO_RUTA_B:
          if (parada) {
            this.#eEstado = E.REPOSO;
          } else if (rtSalidaB && !atascoEnBanda) {
            this.#eEstado = E.EN_MARCHA_ESPERA;
          } else if (tonQ) {
            if (atascoEnBanda || modoWatchdog === 1) {
              this.#eEstado = E.FALLA_ATASCO;
              this.#atascos += 1;
            } else {
              this.#eEstado = E.EN_MARCHA_ESPERA;
            }
          }
          break;

        case E.PARADA_EMERGENCIA:
          if (parada) this.#eEstado = E.REPOSO;
          break;

        case E.ESPERANDO_CAMBIO_ESTIBA:
          this.#eEstado = E.REPOSO;
          break;

        case E.FALLA_ATASCO:
          if (parada && !atascoEnBanda) this.#eEstado = E.REPOSO;
          break;

        case E.INSPECCION_NO_READ:
          if (parada) {
            this.#eEstado = E.REPOSO;
          } else if (rtMarcha) {
            if (selectorDestinoB) {
              this.#ultimoSku = 2;
              this.#eEstado = E.CLASIFICANDO_RUTA_B;
              this.#paquetesB += 1;
            } else {
              this.#ultimoSku = 1;
              this.#eEstado = E.CLASIFICANDO_RUTA_A;
              this.#paquetesA += 1;
            }
          }
          break;
      }
    }

    const s = this.#eEstado;
    const cintaEntrada = s === E.EN_MARCHA_ESPERA || s === E.CLASIFICANDO_RUTA_A || s === E.CLASIFICANDO_RUTA_B;
    const outputs = Object.freeze({
      cintaEntrada,
      desviadorActivo: s === E.CLASIFICANDO_RUTA_B,
      cintaSalidaA: s === E.CLASIFICANDO_RUTA_A,
      cintaSalidaB: s === E.CLASIFICANDO_RUTA_B,
      balizaAlarma: s === E.PARADA_EMERGENCIA || s === E.FALLA_ATASCO,
      senalCambioEstiba: s === E.ESPERANDO_CAMBIO_ESTIBA || s === E.INSPECCION_NO_READ,
      frenoAdmision: s === E.CLASIFICANDO_RUTA_A || s === E.CLASIFICANDO_RUTA_B || s === E.INSPECCION_NO_READ || s === E.FALLA_ATASCO,
      alarmaAtasco: s === E.FALLA_ATASCO,
      avisoNoRead: s === E.INSPECCION_NO_READ,
      balizaVerde: cintaEntrada,
    });

    const codigoFalla = s === E.PARADA_EMERGENCIA ? 1
      : s === E.ESPERANDO_CAMBIO_ESTIBA ? 2
        : s === E.FALLA_ATASCO ? 3
          : s === E.INSPECCION_NO_READ ? 4 : 0;

    const inputRegisters = Object.freeze({
      estadoFsm: s,
      codigoFalla,
      paquetesA: this.#paquetesA,
      paquetesB: this.#paquetesB,
      atascos: this.#atascos,
      noRead: this.#noRead,
      tiempoClasifMs: this.#tiempoClasifMs,
      ultimoSku: this.#ultimoSku,
    });

    const mensaje = Object.freeze({
      timestamp: Date.now(),
      plcConnected: true,
      heartbeat: this.#heartbeatBit,
      inputs: Object.freeze({ ...this.#inputs }),
      outputs,
      holdingRegisters: Object.freeze({ ...this.#holdingRegisters }),
      inputRegisters,
      systemStatus: STATUS_DE_ESTADO[s],
      modo: 'AUTONOMO_PORTAFOLIO',
    });

    this.ultimoEstado = mensaje;
    this.dispatchEvent(new CustomEvent('estado', { detail: mensaje }));
  }
}
