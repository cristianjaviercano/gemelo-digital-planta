// Motor FSM Local IEC 61131-3 (Standalone Web Showcase Mode):
// Emula la máquina de Moore M = (S, Σ, Λ, δ, λ, s0, F) en el navegador
// para que el proyecto pueda desplegarse y ejecutarse interactivamente
// en GitHub Pages, Vercel o la web personal sin requerir backend Modbus.
import { GEOMETRIA } from './plantModel.js';

const T_CLASIFICACION_MS = GEOMETRIA.tClasificacion * 1000; // 4000 ms

export class FsmLocalPLC extends EventTarget {
  conectado = true;
  ultimoEstado = null;
  modoAutonomo = true;

  // Estado FSM
  #estado = 'REPOSO'; // S0..S5
  #tiempoEnEstado = 0;
  #timerHeartbeat = 0;
  #heartbeatBit = false;

  // Entradas (%IX0.0..0.6)
  #inputs = {
    marcha: false,
    parada: false,
    emergencia: false,
    sensorEntrada: false,
    selectorDestinoB: false,
    estibaLlenaA: false,
    estibaLlenaB: false,
  };

  #sensorPrevio = false;
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

    // Procesar pulso o set
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
    }

    this.dispatchEvent(new CustomEvent('ack', { detail: { type: 'ack', target, ok: true } }));
    return true;
  }

  #iniciarCiclo() {
    const SCAN_MS = 50;
    this.#intervaloId = setInterval(() => {
      this.#cicloScan(SCAN_MS);
    }, SCAN_MS);

    // Emitir conexión inicial tras montar
    setTimeout(() => {
      this.dispatchEvent(new CustomEvent('conexion', { detail: { conectado: true, modo: 'autonomo' } }));
    }, 100);
  }

  #cicloScan(dtMs) {
    this.#tiempoEnEstado += dtMs;
    this.#timerHeartbeat = (this.#timerHeartbeat + dtMs) % 1000;
    this.#heartbeatBit = this.#timerHeartbeat < 500;

    const { marcha, parada, emergencia, sensorEntrada, selectorDestinoB, estibaLlenaA, estibaLlenaB } = this.#inputs;
    const sensorFlanco = sensorEntrada && !this.#sensorPrevio;
    this.#sensorPrevio = sensorEntrada;

    const estibaLlenaActiva = estibaLlenaA || estibaLlenaB;

    // Lógica de transición de la Máquina de Moore (Prioridad: Emergencia > Parada > Estiba > Proceso)
    if (emergencia) {
      if (this.#estado !== 'PARADA_EMERGENCIA') {
        this.#estado = 'PARADA_EMERGENCIA';
        this.#tiempoEnEstado = 0;
      }
    } else if (this.#estado === 'PARADA_EMERGENCIA') {
      // Rearme: Parada con Emergencia = FALSE
      if (parada) {
        this.#estado = estibaLlenaActiva ? 'ESPERANDO_CAMBIO_ESTIBA' : 'REPOSO';
        this.#tiempoEnEstado = 0;
      }
    } else if (parada) {
      this.#estado = 'REPOSO';
      this.#tiempoEnEstado = 0;
    } else if (estibaLlenaActiva && this.#estado !== 'ESPERANDO_CAMBIO_ESTIBA') {
      // T9: En marcha o clasificando, una estiba llena suspende a S5
      this.#estado = 'ESPERANDO_CAMBIO_ESTIBA';
      this.#tiempoEnEstado = 0;
    } else {
      switch (this.#estado) {
        case 'REPOSO':
          if (marcha && !estibaLlenaActiva) {
            this.#estado = 'ESPERANDO_PAQUETE';
            this.#tiempoEnEstado = 0;
          }
          break;

        case 'ESPERANDO_PAQUETE':
          if (sensorFlanco) {
            this.#estado = selectorDestinoB ? 'CLASIFICANDO_RUTA_B' : 'CLASIFICANDO_RUTA_A';
            this.#tiempoEnEstado = 0;
          }
          break;

        case 'CLASIFICANDO_RUTA_A':
        case 'CLASIFICANDO_RUTA_B':
          if (this.#tiempoEnEstado >= T_CLASIFICACION_MS) {
            this.#estado = 'ESPERANDO_PAQUETE';
            this.#tiempoEnEstado = 0;
          }
          break;

        case 'ESPERANDO_CAMBIO_ESTIBA':
          if (!estibaLlenaActiva) {
            // T10: Cambio finalizado -> Regresa a Reposo
            this.#estado = 'REPOSO';
            this.#tiempoEnEstado = 0;
          }
          break;
      }
    }

    // Función de salida Lambda (Moore)
    const outputs = {
      cintaEntrada: this.#estado === 'ESPERANDO_PAQUETE' || this.#estado === 'CLASIFICANDO_RUTA_A' || this.#estado === 'CLASIFICANDO_RUTA_B',
      desviadorActivo: this.#estado === 'CLASIFICANDO_RUTA_B',
      cintaSalidaA: this.#estado === 'CLASIFICANDO_RUTA_A',
      cintaSalidaB: this.#estado === 'CLASIFICANDO_RUTA_B',
      balizaAlarma: this.#estado === 'PARADA_EMERGENCIA',
      senalCambioEstiba: this.#estado === 'ESPERANDO_CAMBIO_ESTIBA',
    };

    const mensaje = Object.freeze({
      timestamp: Date.now(),
      plcConnected: true,
      heartbeat: this.#heartbeatBit,
      inputs: { ...this.#inputs },
      outputs,
      systemStatus: this.#estado,
      modo: 'AUTONOMO_PORTAFOLIO',
    });

    this.ultimoEstado = mensaje;
    this.dispatchEvent(new CustomEvent('estado', { detail: mensaje }));
  }
}
