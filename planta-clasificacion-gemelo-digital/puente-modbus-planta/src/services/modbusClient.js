// Cliente Modbus TCP del middleware (docs/01 §6): una sola conexión, todas las
// transacciones en una cola FIFO, polling con setTimeout reprogramado y
// reconexión con retroceso exponencial. Transporta bits; no los interpreta.
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { setTimeout as esperar } from 'node:timers/promises';
import ModbusRTU from 'modbus-serial';

const N_COILS = 7;              // contrato v1.1.0
const N_DISCRETE_INPUTS = 7;
const COIL_EMERGENCIA = 2;
const COIL_SELECTOR = 4;
const COIL_ESTIBA_A = 5;
const COIL_ESTIBA_B = 6;
// Señales de nivel que la planta mantiene y que deben sobrevivir a una reconexión
const COILS_DE_NIVEL = [COIL_EMERGENCIA, COIL_SELECTOR, COIL_ESTIBA_A, COIL_ESTIBA_B];

const errorDesconectado = () => Object.assign(new Error('PLC desconectado'), { code: 'PLC_DESCONECTADO' });

// Eventos: 'conectado', 'desconectado' {motivo}, 'reintento' {intento, esperaMs, motivo},
//          'lectura' {coils, discreteInputs}
export class ClienteModbus extends EventEmitter {
  #opciones;
  #cliente = null;
  #conectado = false;
  #detenido = true;
  #cola = Promise.resolve();
  #intentos = 0;
  #temporizador = null;
  // Último nivel ordenado para la seta, el selector y las estibas. Se reaplica en
  // la inicialización segura tras cada (re)conexión (docs/02 §3.1 y §6, FC15).
  #nivelesPanel = Object.fromEntries(COILS_DE_NIVEL.map((coil) => [coil, false]));

  constructor({ host, port, unitId, timeoutMs, pollIntervalMs, pulseWidthMs, reconnect }) {
    super();
    this.#opciones = { host, port, unitId, timeoutMs, pollIntervalMs, pulseWidthMs, reconnect };
  }

  get conectado() {
    return this.#conectado;
  }

  iniciar() {
    this.#detenido = false;
    this.#conectar();
  }

  async detener() {
    this.#detenido = true;
    this.#conectado = false;
    clearTimeout(this.#temporizador);
    await this.#cerrarCliente();
  }

  async escribirCoil(coil, valor) {
    if (COILS_DE_NIVEL.includes(coil)) this.#nivelesPanel[coil] = valor;
    try {
      await this.#encolar((cliente) => cliente.writeCoil(coil, valor));             // FC05
    } catch (error) {
      if (error.code !== 'PLC_DESCONECTADO') this.#perderConexion(error);
      throw error;
    }
  }

  // Pulsador momentáneo (H2). Si la conexión cae entre ON y OFF, la
  // inicialización segura de la reconexión deja el coil en 0.
  async pulso(coil) {
    await this.escribirCoil(coil, true);
    await esperar(this.#opciones.pulseWidthMs);
    await this.escribirCoil(coil, false);
  }

  // Exclusión mutua: cada transacción espera a que termine la anterior, así una
  // escritura por evento nunca se solapa con una lectura cíclica.
  #encolar(transaccion) {
    const resultado = this.#cola.then(() => {
      if (!this.#conectado) throw errorDesconectado();
      return transaccion(this.#cliente);
    });
    this.#cola = resultado.catch(() => {});
    return resultado;
  }

  async #conectar() {
    if (this.#detenido) return;
    const { host, port, unitId, timeoutMs } = this.#opciones;
    const cliente = new ModbusRTU();
    try {
      await cliente.connectTCP(host, { port });
      cliente.setID(unitId);
      cliente.setTimeout(timeoutMs);
    } catch (error) {
      this.#programarReconexion(error);
      return;
    }
    if (this.#detenido) {
      cliente.close(() => {});
      return;
    }
    this.#cliente = cliente;
    this.#conectado = true;

    // Inicialización segura (FC15): pulsadores y sensor a 0; seta, selector y
    // estibas conservan su último valor
    const coils = Array.from({ length: N_COILS }, (_, coil) => this.#nivelesPanel[coil] ?? false);
    try {
      await this.#encolar((c) => c.writeCoils(0, coils));
    } catch (error) {
      this.#perderConexion(error);
      return;
    }
    this.#intentos = 0;
    this.emit('conectado', { inicializacion: coils });
    this.#programarLectura(0);
  }

  #programarLectura(retardoMs) {
    this.#temporizador = setTimeout(() => this.#leer(), retardoMs);
  }

  async #leer() {
    const inicio = performance.now();
    let coils;
    let discreteInputs;
    try {
      coils = (await this.#encolar((c) => c.readCoils(0, N_COILS))).data.slice(0, N_COILS);                      // FC01
      discreteInputs = (await this.#encolar((c) => c.readDiscreteInputs(0, N_DISCRETE_INPUTS))).data.slice(0, N_DISCRETE_INPUTS); // FC02
    } catch (error) {
      this.#perderConexion(error);
      return;
    }
    this.emit('lectura', { coils, discreteInputs });

    // setTimeout reprogramado al terminar (no setInterval): si una respuesta
    // tarda más que T_p, no se acumulan solicitudes
    if (this.#conectado && !this.#detenido) {
      this.#programarLectura(Math.max(0, this.#opciones.pollIntervalMs - (performance.now() - inicio)));
    }
  }

  #perderConexion(error) {
    if (!this.#conectado) return;
    this.#conectado = false;
    clearTimeout(this.#temporizador);
    this.#cerrarCliente();
    this.emit('desconectado', { motivo: error.message });
    this.#programarReconexion(error);
  }

  // T_rc(n) = min(base · 2ⁿ, max): 500, 1000, 2000, 4000, 5000 ms… (docs/02 §5)
  #programarReconexion(error) {
    if (this.#detenido) return;
    const { baseMs, maxMs } = this.#opciones.reconnect;
    const esperaMs = Math.min(baseMs * 2 ** this.#intentos, maxMs);
    this.#intentos += 1;
    this.emit('reintento', { intento: this.#intentos, esperaMs, motivo: error.message });
    this.#temporizador = setTimeout(() => this.#conectar(), esperaMs);
  }

  // close() no llama a su callback si el PLC ya cerró el socket: sin el plazo,
  // detener el middleware justo después de una caída del PLC quedaría colgado
  #cerrarCliente() {
    const cliente = this.#cliente;
    this.#cliente = null;
    if (!cliente?.isOpen) return Promise.resolve();
    return new Promise((resolve) => {
      const plazo = setTimeout(resolve, 500);
      try {
        cliente.close(() => {
          clearTimeout(plazo);
          resolve();
        });
      } catch {
        clearTimeout(plazo);
        resolve();
      }
    });
  }
}
