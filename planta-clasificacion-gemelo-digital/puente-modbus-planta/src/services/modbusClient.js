// Cliente Modbus TCP del middleware (Contrato v1.2.0): una sola conexión, todas las
// transacciones en una cola FIFO, polling de las 4 tablas Modbus (FC01, FC02, FC03, FC04)
// con setTimeout reprogramado y reconexión con retroceso exponencial.
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { setTimeout as esperar } from 'node:timers/promises';
import ModbusRTU from 'modbus-serial';

const N_COILS = 10;              // Coils 0..9
const N_DISCRETE_INPUTS = 11;    // Discrete Inputs 0..10
const N_HOLDING_REGISTERS = 4;   // Holding Registers 0..3
const N_INPUT_REGISTERS = 8;     // Input Registers 0..7

const COIL_EMERGENCIA = 2;
const COIL_SELECTOR = 4;
const COIL_ESTIBA_A = 5;
const COIL_ESTIBA_B = 6;
const COIL_ATASCO = 9;
// Señales de nivel que la planta mantiene y que deben sobrevivir a una reconexión
const COILS_DE_NIVEL = [COIL_EMERGENCIA, COIL_SELECTOR, COIL_ESTIBA_A, COIL_ESTIBA_B, COIL_ATASCO];

const errorDesconectado = () => Object.assign(new Error('PLC desconectado'), { code: 'PLC_DESCONECTADO' });

export class ClienteModbus extends EventEmitter {
  #opciones;
  #cliente = null;
  #conectado = false;
  #detenido = true;
  #cola = Promise.resolve();
  #intentos = 0;
  #temporizador = null;
  #nivelesPanel = Object.fromEntries(COILS_DE_NIVEL.map((coil) => [coil, false]));
  #registrosPanel = { 0: 0, 1: 0, 2: 0, 3: 4000 };

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

  async escribirRegistro(register, valor) {
    this.#registrosPanel[register] = valor;
    try {
      await this.#encolar((cliente) => cliente.writeRegister(register, valor));     // FC06
    } catch (error) {
      if (error.code !== 'PLC_DESCONECTADO') this.#perderConexion(error);
      throw error;
    }
  }

  async pulso(coil) {
    await this.escribirCoil(coil, true);
    await esperar(this.#opciones.pulseWidthMs);
    await this.escribirCoil(coil, false);
  }

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

    // Inicialización segura (FC15 + FC16): pulsadores y sensores transitorios a 0;
    // seta, selector, estibas, atasco y holding registers conservan su último valor
    const coils = Array.from({ length: N_COILS }, (_, coil) => this.#nivelesPanel[coil] ?? false);
    const hrs = Array.from({ length: N_HOLDING_REGISTERS }, (_, r) => this.#registrosPanel[r] ?? 0);
    try {
      await this.#encolar((c) => c.writeCoils(0, coils));
      await this.#encolar((c) => c.writeRegisters(0, hrs));
    } catch (error) {
      this.#perderConexion(error);
      return;
    }
    this.#intentos = 0;
    this.emit('conectado', { inicializacion: coils, holdingRegisters: hrs });
    this.#programarLectura(0);
  }

  #programarLectura(retardoMs) {
    this.#temporizador = setTimeout(() => this.#leer(), retardoMs);
  }

  async #leer() {
    const inicio = performance.now();
    let coils;
    let discreteInputs;
    let holdingRegisters;
    let inputRegisters;
    try {
      coils = (await this.#encolar((c) => c.readCoils(0, N_COILS))).data.slice(0, N_COILS);                                  // FC01
      discreteInputs = (await this.#encolar((c) => c.readDiscreteInputs(0, N_DISCRETE_INPUTS))).data.slice(0, N_DISCRETE_INPUTS); // FC02
      holdingRegisters = (await this.#encolar((c) => c.readHoldingRegisters(0, N_HOLDING_REGISTERS))).data.slice(0, N_HOLDING_REGISTERS); // FC03
      inputRegisters = (await this.#encolar((c) => c.readInputRegisters(0, N_INPUT_REGISTERS))).data.slice(0, N_INPUT_REGISTERS); // FC04
    } catch (error) {
      this.#perderConexion(error);
      return;
    }
    this.emit('lectura', { coils, discreteInputs, holdingRegisters, inputRegisters });

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

  #programarReconexion(error) {
    if (this.#detenido) return;
    const { baseMs, maxMs } = this.#opciones.reconnect;
    const esperaMs = Math.min(baseMs * 2 ** this.#intentos, maxMs);
    this.#intentos += 1;
    this.emit('reintento', { intento: this.#intentos, esperaMs, motivo: error.message });
    this.#temporizador = setTimeout(() => this.#conectar(), esperaMs);
  }

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
