// Runtime del PLC virtual: tarea cíclica (MainTask), PLC_PRG y esclavo Modbus TCP
// con las 4 tablas del contrato v1.2.0 (Coils, Discrete Inputs, Holding Registers, Input Registers).
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import ModbusRTU from 'modbus-serial';
import { FB_ClasificadorFSM, FB_Heartbeat, GVL_Param, nombreEstado } from './clasificador.js';

// Coils 0..9 → %IX0.0..1.1 (escritos por el maestro, FC05/FC15)
export const COILS = [
  'Marcha', 'Parada', 'Emergencia', 'Sensor_Entrada', 'Selector_Destino',
  'Estiba_Llena_A', 'Estiba_Llena_B', 'Sensor_Salida_A', 'Sensor_Salida_B', 'Atasco_Planta',
];

// Discrete Inputs 0..10 ← %QX0.0..1.2 (leídos por el maestro, FC02)
export const DISCRETE_INPUTS = [
  'Motor_Cinta_Entrada', 'Actuador_Desviador', 'Motor_Cinta_Salida_A',
  'Motor_Cinta_Salida_B', 'Baliza_Alarma', 'Heartbeat_Out', 'Senal_Cambio_Estiba',
  'Stopper_Admision', 'Alarma_Atasco', 'Aviso_NoRead', 'Baliza_Verde',
];

// Holding Registers 0..3 ↔ %MW0..3 (leídos/escritos por el maestro, FC03/FC06)
export const HOLDING_REGISTERS = [
  'HR_Modo_Ruteo', 'HR_SKU_Escaneado', 'HR_Modo_Watchdog', 'HR_Tiempo_Watchdog_Ms',
];
export const VALORES_INICIALES_HR = Object.freeze([0, 0, 0, GVL_Param.T_CLASIFICACION]);

// Input Registers 0..7 ← %IW0..7 (telemetría del PLC, FC04)
export const INPUT_REGISTERS = [
  'IR_Estado_FSM', 'IR_Codigo_Falla', 'IR_Paquetes_A', 'IR_Paquetes_B',
  'IR_Atascos', 'IR_NoRead', 'IR_Tiempo_Clasif_Ms', 'IR_Ultimo_SKU',
];

const direccionIlegal = (area, direccion) => ({
  modbusErrorCode: 0x02,
  msg: `${area} ${direccion} fuera del contrato v1.2.0`,
});

export class PlcVirtual extends EventEmitter {
  fbClasificador = new FB_ClasificadorFSM();
  fbHeartbeat = new FB_Heartbeat();
  #coils = COILS.map(() => false);
  #discreteInputs = DISCRETE_INPUTS.map(() => false);
  #holdingRegisters = [...VALORES_INICIALES_HR];
  #inputRegisters = INPUT_REGISTERS.map(() => 0);
  #ixAnterior = COILS.map(() => false);
  #hrAnterior = [...VALORES_INICIALES_HR];
  #servidor = null;
  #tarea = null;
  #siguiente = 0;

  constructor({ host = '127.0.0.1', port = 5020, unitId = 1, tScanMs = 10 } = {}) {
    super();
    Object.assign(this, { host, port, unitId, tScanMs });
  }

  iniciar() {
    return new Promise((resolve, reject) => {
      const vector = {
        getCoil: (dir) => {
          if (dir >= COILS.length) throw direccionIlegal('Coil', dir);
          return this.#coils[dir];
        },
        getDiscreteInput: (dir) => {
          if (dir >= DISCRETE_INPUTS.length) throw direccionIlegal('Discrete Input', dir);
          return this.#discreteInputs[dir];
        },
        setCoil: (dir, valor) => {
          if (dir >= COILS.length) throw direccionIlegal('Coil', dir);
          this.#coils[dir] = Boolean(valor);
        },
        getHoldingRegister: (dir) => {
          if (dir >= HOLDING_REGISTERS.length) throw direccionIlegal('Holding Register', dir);
          return this.#holdingRegisters[dir];
        },
        setRegister: (dir, valor) => {
          if (dir >= HOLDING_REGISTERS.length) throw direccionIlegal('Holding Register', dir);
          this.#holdingRegisters[dir] = Number(valor) & 0xffff;
        },
        getInputRegister: (dir) => {
          if (dir >= INPUT_REGISTERS.length) throw direccionIlegal('Input Register', dir);
          return this.#inputRegisters[dir];
        },
      };
      this.#servidor = new ModbusRTU.ServerTCP(vector, { host: this.host, port: this.port, unitID: this.unitId });
      this.#servidor.once('serverError', reject);
      this.#servidor.once('initialized', () => {
        this.#arrancarTarea();
        resolve();
      });
    });
  }

  get enEjecucion() {
    return this.#tarea !== null;
  }

  pausar() {
    clearTimeout(this.#tarea);
    this.#tarea = null;
  }

  reanudar() {
    if (this.#tarea === null) this.#arrancarTarea();
  }

  detener() {
    clearTimeout(this.#tarea);
    this.#tarea = null;
    return new Promise((resolve) => (this.#servidor ? this.#servidor.close(resolve) : resolve()));
  }

  #arrancarTarea() {
    this.#siguiente = performance.now();
    this.#programar();
  }

  #programar() {
    const ahora = performance.now();
    this.#siguiente += this.tScanMs;
    if (this.#siguiente < ahora) this.#siguiente = ahora;
    this.#tarea = setTimeout(() => {
      this.#cicloScan();
      if (this.#tarea !== null) this.#programar();
    }, this.#siguiente - ahora);
  }

  // Un ciclo de MainTask: lectura de entradas (%IX, %MW) → PLC_PRG → escritura (%QX, %IW)
  #cicloScan() {
    const ahora = performance.now();
    const ix = [...this.#coils];
    ix.forEach((valor, i) => {
      if (valor !== this.#ixAnterior[i]) this.emit('entrada', { coil: i, nombre: COILS[i], valor });
    });
    this.#ixAnterior = ix;

    const hr = [...this.#holdingRegisters];
    hr.forEach((valor, i) => {
      if (valor !== this.#hrAnterior[i]) this.emit('registro', { register: i, nombre: HOLDING_REGISTERS[i], valor });
    });
    this.#hrAnterior = hr;

    const fb = this.fbClasificador;
    const estadoPrevio = fb.eEstado;
    const fallaPrevia = fb.xFallaCoherencia;

    const tWatchdog = hr[3] >= 1000 && hr[3] <= 15000 ? hr[3] : GVL_Param.T_CLASIFICACION;

    // logica_clasificador_fsm.st [3] · PLC_PRG
    this.fbHeartbeat.ejecutar({ tSemiperiodo: GVL_Param.T_HEARTBEAT }, ahora);
    fb.ejecutar({
      xMarcha: ix[0],
      xParada: ix[1],
      xEmergencia: ix[2],
      xSensor: ix[3],
      xSelectorB: ix[4],
      xEstibaLlenaA: ix[5],
      xEstibaLlenaB: ix[6],
      xSensorSalidaA: ix[7],
      xSensorSalidaB: ix[8],
      xAtascoPlanta: ix[9],
      uiModoRuteo: hr[0],
      uiSkuEscaneado: hr[1],
      uiModoWatchdog: hr[2],
      tClasificacion: tWatchdog,
    }, ahora);

    this.#discreteInputs = [
      fb.xCintaEntrada,
      fb.xDesviador,
      fb.xCintaSalidaA,
      fb.xCintaSalidaB,
      fb.xBaliza || fb.xFallaCoherencia,
      this.fbHeartbeat.xPulso,
      fb.xSenalCambioEstiba,
      fb.xStopperAdmision,
      fb.xAlarmaAtasco,
      fb.xAvisoNoRead,
      fb.xBalizaVerde,
    ];

    this.#inputRegisters = [
      fb.eEstado & 0xffff,
      fb.uiCodigoFalla & 0xffff,
      fb.udiPaquetesA & 0xffff,
      fb.udiPaquetesB & 0xffff,
      fb.udiAtascos & 0xffff,
      fb.udiNoRead & 0xffff,
      fb.uiTiempoClasifMs & 0xffff,
      fb.uiUltimoSku & 0xffff,
    ];

    if (fb.eEstado !== estadoPrevio) {
      this.emit('estado', { desde: nombreEstado(estadoPrevio), hacia: nombreEstado(fb.eEstado) });
    }
    if (fb.xFallaCoherencia && !fallaPrevia) this.emit('falla', { estado: nombreEstado(fb.eEstado) });
  }
}
