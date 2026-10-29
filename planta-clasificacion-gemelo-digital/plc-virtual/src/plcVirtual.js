// Runtime del PLC virtual: tarea cíclica (MainTask), PLC_PRG y esclavo Modbus TCP
// con el mismo mapa de memoria que plc-codesys/config_modbus_slave.json v1.1.0.
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import ModbusRTU from 'modbus-serial';
import { FB_ClasificadorFSM, FB_Heartbeat, GVL_Param, nombreEstado } from './clasificador.js';

// Coils 0..6 → %IX0.0..0.6 (escritos por el maestro)
export const COILS = [
  'Marcha', 'Parada', 'Emergencia', 'Sensor_Entrada', 'Selector_Destino', 'Estiba_Llena_A', 'Estiba_Llena_B',
];
// Discrete Inputs 0..6 ← %QX0.0..0.6 (leídos por el maestro)
export const DISCRETE_INPUTS = [
  'Motor_Cinta_Entrada', 'Actuador_Desviador', 'Motor_Cinta_Salida_A',
  'Motor_Cinta_Salida_B', 'Baliza_Alarma', 'Heartbeat_Out', 'Senal_Cambio_Estiba',
];

const direccionIlegal = (area, direccion) => ({
  modbusErrorCode: 0x02,
  msg: `${area} ${direccion} fuera del contrato v1.1.0`,
});

export class PlcVirtual extends EventEmitter {
  fbClasificador = new FB_ClasificadorFSM();
  fbHeartbeat = new FB_Heartbeat();
  #coils = COILS.map(() => false);
  #discreteInputs = DISCRETE_INPUTS.map(() => false);
  #ixAnterior = COILS.map(() => false);
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
          this.#coils[dir] = valor;
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

  // Emula STOP/RUN de CODESYS: el esclavo Modbus sigue respondiendo con la
  // última imagen de proceso, pero el programa no se ejecuta y el heartbeat se congela
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

  // MainTask cíclica: cada ciclo se programa sobre la marca ideal k·T_scan y no
  // sobre el final del anterior. setInterval acumula el retraso de cada disparo
  // (≈ 12 ms de periodo medio en macOS); así el periodo medio es T_scan, como en CODESYS
  #arrancarTarea() {
    this.#siguiente = performance.now();
    this.#programar();
  }

  #programar() {
    const ahora = performance.now();
    this.#siguiente += this.tScanMs;
    // Tras un bloqueo de más de un ciclo no se encadenan los ciclos perdidos
    if (this.#siguiente < ahora) this.#siguiente = ahora;
    this.#tarea = setTimeout(() => {
      this.#cicloScan();
      if (this.#tarea !== null) this.#programar();
    }, this.#siguiente - ahora);
  }

  // Un ciclo de MainTask: lectura de entradas → PLC_PRG → escritura de salidas
  #cicloScan() {
    const ahora = performance.now();
    const ix = [...this.#coils];
    ix.forEach((valor, i) => {
      if (valor !== this.#ixAnterior[i]) this.emit('entrada', { coil: i, nombre: COILS[i], valor });
    });
    this.#ixAnterior = ix;

    const fb = this.fbClasificador;
    const estadoPrevio = fb.eEstado;
    const fallaPrevia = fb.xFallaCoherencia;

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
      tClasificacion: GVL_Param.T_CLASIFICACION,
    }, ahora);
    this.#discreteInputs = [
      fb.xCintaEntrada,
      fb.xDesviador,
      fb.xCintaSalidaA,
      fb.xCintaSalidaB,
      fb.xBaliza || fb.xFallaCoherencia,
      this.fbHeartbeat.xPulso,
      fb.xSenalCambioEstiba,
    ];

    if (fb.eEstado !== estadoPrevio) {
      this.emit('estado', { desde: nombreEstado(estadoPrevio), hacia: nombreEstado(fb.eEstado) });
    }
    if (fb.xFallaCoherencia && !fallaPrevia) this.emit('falla', { estado: nombreEstado(fb.eEstado) });
  }
}
