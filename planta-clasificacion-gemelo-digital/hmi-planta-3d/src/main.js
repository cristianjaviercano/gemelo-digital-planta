// HMI/SCADA 3D (capa C3 · Contrato v1.2.0): monta la planta con pórtico escáner,
// tope indexador (%QX0.7), fotoceldas de salida A/B (%IX0.7, %IX1.0), torreta
// de 3 niveles, visualizador didáctico "Rayos X del PLC" y KPIs ejecutivos B2B.
import { Vector3 } from 'three';
import { crearEscena } from './core/sceneManager.js';
import { ClienteMiddleware, urlMiddleware } from './core/wsClient.js';
import { ESTIBAS, GEOMETRIA, ModeloPlanta, TRAMOS, tiempoDespeje } from './core/plantModel.js';
import { crearCinta } from './components3d/conveyorBelt.js';
import { crearDesviador } from './components3d/diverterMechanism.js';
import { crearBaliza, crearSensor, crearSensorSalida, crearStopperAdmision } from './components3d/sensorsAndBeacons.js';
import { crearGestorPaquetes } from './components3d/packageSpawner.js';
import { crearArmarioControl } from './components3d/modelos_3d/index.js';
import { crearEtiquetas } from './ui/hudLabels.js';
import { crearPanel } from './ui/operatorPanel.js';
import { crearExplicadorPLC } from './ui/plcExplainer.js';

const G = GEOMETRIA;
const ESPERA_ALIMENTACION = 0.9;
const MAX_PAQUETES_AUTO = 3;

// ------------------------------------------------------------------ planta 3D --
const contenedorEscena = document.querySelector('#escena');
const { escena, alActualizar, reiniciarVista } = crearEscena(contenedorEscena);
const modelo = new ModeloPlanta();
const cintas = {
  entrada: crearCinta({ nombre: 'cinta-entrada', desde: new Vector3(G.xInicioEntrada, 0, 0), hasta: new Vector3(G.xSensor, 0, 0) }),
  zona: crearCinta({
    nombre: 'zona-desvio', desde: new Vector3(G.xSensor, 0, 0), hasta: new Vector3(G.xSensor + G.largoZonaDesvio, 0, 0),
    ancho: 0.62, desfaseZ: 0.085, conMotor: false, largueros: [-1], cota: -0.006,
  }),
  salidaA: crearCinta({ nombre: 'salida-a', desde: TRAMOS.A[1].desde, hasta: TRAMOS.A[1].hasta }),
  salidaB: crearCinta({ nombre: 'salida-b', desde: TRAMOS.B[1].desde, hasta: TRAMOS.B[1].hasta }),
};
const desviador = crearDesviador();
const sensor = crearSensor();
const stopper = crearStopperAdmision();
const sensoresSalida = {
  A: crearSensorSalida('A'),
  B: crearSensorSalida('B'),
};
const baliza = crearBaliza(new Vector3(-0.6, 0, -0.8));
const armario = crearArmarioControl();
armario.position.set(-1.6, 0, -0.9);
armario.rotation.y = Math.PI / 10;
escena.add(
  ...Object.values(cintas).map((c) => c.grupo),
  desviador.grupo,
  sensor.grupo,
  stopper.grupo,
  sensoresSalida.A.grupo,
  sensoresSalida.B.grupo,
  baliza.grupo,
  armario,
);
const paquetes = crearGestorPaquetes(escena, modelo);

const etiquetas = crearEtiquetas(escena, [
  { clave: 'entrada', punto: cintas.entrada.puntoEtiqueta, direccion: 'Q0 · %QX0.0', titulo: 'Cinta de entrada' },
  { clave: 'stopper', punto: stopper.puntoEtiqueta, direccion: 'Q7 · %QX0.7', titulo: 'Stopper indexador' },
  { clave: 'sensor', punto: sensor.puntoEtiqueta, direccion: 'I3 · %IX0.3 / %MW1', titulo: 'Pórtico escáner' },
  { clave: 'desviador', punto: desviador.puntoEtiqueta, direccion: 'Q1 · %QX0.1', titulo: 'Desviador' },
  { clave: 'salidaA', punto: cintas.salidaA.puntoEtiqueta, direccion: 'Q2 · %QX0.2', titulo: 'Salida A' },
  { clave: 'salidaB', punto: cintas.salidaB.puntoEtiqueta, direccion: 'Q3 · %QX0.3', titulo: 'Salida B' },
  { clave: 'sensorSalidaA', punto: sensoresSalida.A.puntoEtiqueta, direccion: 'I7 · %IX0.7', titulo: 'Sensor salida A' },
  { clave: 'sensorSalidaB', punto: sensoresSalida.B.puntoEtiqueta, direccion: 'I8 · %IX1.0', titulo: 'Sensor salida B' },
  { clave: 'baliza', punto: baliza.puntoEtiqueta, direccion: 'Q4/Q6/Q10', titulo: 'Torreta de estado' },
  { clave: 'armario', punto: new Vector3(-1.6, 1.6, -0.9), direccion: 'C1 · IEC 61131-3', titulo: 'Armario PLC' },
  ...['A', 'B'].map((rama, i) => ({
    clave: `estiba${rama}`,
    punto: ESTIBAS[rama].centro.clone().setY(1.22),
    direccion: `I${5 + i} · %IX0.${5 + i}`,
    titulo: `Estiba ${rama}`,
  })),
]);

// Visualizador didáctico "Rayos X del PLC" y KPIs ejecutivos acoplado en #escena
const explicadorPlc = crearExplicadorPLC(contenedorEscena);

// ----------------------------------------------------------- middleware y panel --
const urlWs = urlMiddleware();
const cliente = new ClienteMiddleware(urlWs);
const panel = crearPanel(document.querySelector('#panel'), document.querySelector('#aviso-escena'), {
  urlWs,
  parametros: { ...G, despejeA: tiempoDespeje('A'), despejeB: tiempoDespeje('B') },
  autoInicial: new URLSearchParams(window.location.search).get('auto') === '1',
  alOrdenar: (comando) => cliente.enviar(comando),
  alGenerarPaquete: (opciones) => generarPaquete(opciones),
  alCambiarEtiquetas: (visibles) => etiquetas.setVisibles(visibles),
  alReiniciarVista: reiniciarVista,
  alCambiarEstiba: (rama) => {
    if (modelo.cambiarEstiba(rama)) panel.registrar(`Cambio de la estiba ${rama} en curso`);
    else panel.registrar(`La estiba ${rama} no se puede cambiar ahora`, 'aviso');
  },
  alApilarNivelEstiba: (rama) => {
    const agregados = modelo.apilarNivelEstiba(rama);
    if (agregados > 0) {
      const estiba = modelo.estibas[rama];
      const nivelActual = Math.ceil(estiba.paquetes.length / 16);
      const nivelesTotales = Math.max(1, Math.ceil(estiba.capacidad / 16));
      panel.registrar(`Estiba ${rama}: +${agregados} cajas apiladas (Nivel ${nivelActual}/${nivelesTotales} · ${estiba.paquetes.length}/${estiba.capacidad})`);
    } else {
      panel.registrar(`La estiba ${rama} ya está llena o en cambio`, 'aviso');
    }
  },
  alCambiarCapacidad: (valor) => {
    const capacidad = modelo.fijarCapacidad(valor);
    const niveles = Math.ceil(capacidad / 16);
    panel.registrar(`Capacidad por estiba: ${capacidad} paquetes (${niveles} niveles)`);
    return capacidad;
  },
  alCambiarAtasco: () => {
    const nuevo = modelo.fijarAtasco(!modelo.atascoActivo);
    cliente.enviar({ target: 'atascoEnBanda', action: 'set', value: nuevo });
    panel.registrar(
      nuevo ? 'Atasco físico inducido en banda (%IX1.1 = 1)' : 'Atasco despejado (%IX1.1 = 0) · Pulse Parada para rearmar',
      nuevo ? 'alarma' : 'info',
    );
  },
  alCambiarCriterioSorting: (criterio) => {
    modelo.fijarCriterioSorting(criterio);
    panel.registrar(
      criterio === 'peso'
        ? `Sorting por Báscula Dinámica: <${modelo.umbralPesoKg} kg → A, ≥${modelo.umbralPesoKg} kg → B`
        : 'Sorting por Prioridad/Tipo: Express/Frágil → A, Estándar/Pesado → B',
    );
  },
});

function generarPaquete(opciones = {}) {
  const paquete = modelo.generarPaquete(opciones);
  if (paquete) {
    panel.registrar(`Paquete #${paquete.id} [${paquete.etiqueta}] en cinta de entrada`);
  } else {
    panel.registrar('Inicio de banda ocupado: esperar avance', 'aviso');
  }
}

const SENALES_ESTIBA = { A: 'estibaLlenaA', B: 'estibaLlenaB' };
const SENALES_SALIDA = { A: 'sensorSalidaA', B: 'sensorSalidaB' };
let resincronizarSensor = true;
let modoInicialConfigurado = false;

function resincronizarSenales(estado) {
  const pendientes = [
    ['sensorEntrada', modelo.sensorOcupado],
    ['sensorSalidaA', modelo.sensoresSalidaOcupados.A],
    ['sensorSalidaB', modelo.sensoresSalidaOcupados.B],
    ['atascoEnBanda', modelo.atascoActivo],
  ];
  for (const [rama, target] of Object.entries(SENALES_ESTIBA)) {
    pendientes.push([target, modelo.estibaNoDisponible(rama)]);
  }
  for (const [target, valor] of pendientes) {
    if (estado.inputs[target] !== valor) cliente.enviar({ target, action: 'set', value: valor });
  }
  if (!modoInicialConfigurado) {
    modoInicialConfigurado = true;
    cliente.enviar({ target: 'modoRuteo', action: 'write', value: 1 });
    cliente.enviar({ target: 'modoWatchdog', action: 'write', value: 1 });
  }
}

let plcVivoPrevio = false;
let statusPrevio = null;
let instanteUltimoEstado = 0;
let intervaloMs = null;

cliente.addEventListener('conexion', ({ detail }) => {
  panel.registrar(detail.conectado ? 'Middleware conectado' : 'Middleware desconectado', detail.conectado ? 'info' : 'aviso');
  resincronizarSensor = true;
});
cliente.addEventListener('ack', ({ detail }) => {
  if (!detail.ok) panel.registrar(`Orden ${detail.target ?? '?'} rechazada: ${detail.error}`, 'aviso');
});
cliente.addEventListener('estado', ({ detail: estado }) => {
  const ahora = performance.now();
  if (instanteUltimoEstado) {
    const intervalo = ahora - instanteUltimoEstado;
    intervaloMs = intervaloMs === null ? intervalo : 0.9 * intervaloMs + 0.1 * intervalo;
  }
  instanteUltimoEstado = ahora;
  if (estado.plcConnected !== plcVivoPrevio) {
    panel.registrar(estado.plcConnected ? 'PLC en línea' : 'PLC sin conexión · cinemática detenida',
      estado.plcConnected ? 'info' : 'aviso');
    if (estado.plcConnected) resincronizarSensor = true;
    plcVivoPrevio = estado.plcConnected;
  }
  if (estado.systemStatus !== statusPrevio) {
    if (estado.systemStatus === 'PARADA_EMERGENCIA') panel.registrar('Parada de emergencia activada', 'alarma');
    else if (estado.systemStatus === 'FALLA_ATASCO') panel.registrar('Alarma de Atasco: Watchdog TON vencido sin salida', 'alarma');
    else if (estado.systemStatus === 'INSPECCION_NO_READ') panel.registrar('Pausa NO_READ: código ilegible en escáner', 'aviso');
    statusPrevio = estado.systemStatus;
  }
});

const encendido = (valor) => (valor ? { texto: 'ON', nivel: 'on' } : { texto: 'OFF', nivel: 'off' });

function valoresEtiquetas(salidas, estado) {
  const ocupacion = modelo.sensorOcupado ? 'ocupado' : 'libre';
  if (!salidas) {
    const sinDato = { texto: 'sin dato', nivel: 'nd' };
    return {
      entrada: sinDato, stopper: sinDato, desviador: sinDato, salidaA: sinDato, salidaB: sinDato,
      sensorSalidaA: sinDato, sensorSalidaB: sinDato, baliza: sinDato, armario: sinDato,
      sensor: { texto: `${ocupacion} · PLC sin dato`, nivel: 'nd' },
      ...valoresEstibas(null),
    };
  }
  const skuActual = estado?.holdingRegisters?.skuEscaneado ?? 0;
  const textoSku = skuActual === 99 ? 'NO_READ' : skuActual === 2 ? 'Estiba B' : skuActual === 1 ? 'Estiba A' : '—';
  return {
    entrada: encendido(salidas.cintaEntrada),
    stopper: salidas.frenoAdmision ? { texto: 'RETENIENDO', nivel: 'aviso' } : { texto: 'LIBRE', nivel: 'off' },
    sensor: {
      texto: `${ocupacion} · ${textoSku}`,
      nivel: estado.inputs.sensorEntrada ? (skuActual === 99 ? 'alarma' : 'on') : 'off',
    },
    desviador: { texto: salidas.desviadorActivo ? '→ ruta B' : '→ ruta A', nivel: salidas.desviadorActivo ? 'on' : 'off' },
    salidaA: encendido(salidas.cintaSalidaA),
    salidaB: encendido(salidas.cintaSalidaB),
    sensorSalidaA: {
      texto: modelo.sensoresSalidaOcupados.A ? 'DESCARGA OK' : 'libre',
      nivel: estado.inputs.sensorSalidaA ? 'on' : 'off',
    },
    sensorSalidaB: {
      texto: modelo.sensoresSalidaOcupados.B ? 'DESCARGA OK' : 'libre',
      nivel: estado.inputs.sensorSalidaB ? 'on' : 'off',
    },
    baliza: salidas.balizaAlarma
      ? { texto: salidas.alarmaAtasco ? 'ATASCO' : 'EMERGENCIA', nivel: 'alarma' }
      : salidas.senalCambioEstiba
        ? { texto: salidas.avisoNoRead ? 'NO_READ' : 'CAMBIO ESTIBA', nivel: 'aviso' }
        : salidas.balizaVerde ? { texto: 'EN MARCHA', nivel: 'on' } : { texto: 'REPOSO', nivel: 'off' },
    armario: {
      texto: estado?.modo === 'AUTONOMO_PORTAFOLIO' ? 'Web FSM Activa' : (estado?.plcConnected ? 'PLC en línea' : 'Sin conexión'),
      nivel: estado?.plcConnected ? 'on' : 'off',
    },
    ...valoresEstibas(estado),
  };
}

function valoresEstibas(estado) {
  const valores = {};
  for (const rama of ['A', 'B']) {
    const estiba = modelo.estibas[rama];
    const nivelesTotales = Math.max(1, Math.ceil(estiba.capacidad / 16));
    const nivelActual = estiba.paquetes.length === 0 ? 0 : Math.min(nivelesTotales, Math.ceil(estiba.paquetes.length / 16));
    const leido = estado ? ` · PLC lee ${Number(estado.inputs[SENALES_ESTIBA[rama]])}` : '';
    const texto = `N${nivelActual}/${nivelesTotales} (${estiba.paquetes.length}/${estiba.capacidad}) ${estiba.estado === 'cambiando' ? 'en cambio' : estiba.estado}${leido}`;
    valores[`estiba${rama}`] = { texto, nivel: estiba.estado === 'disponible' ? 'off' : 'aviso' };
  }
  return valores;
}

// -------------------------------------------------------------- ciclo por fotograma --
const SUBPASO_MAXIMO = 0.05;
let tiempoParaAuto = 0;

function pasoSimulacion(h, estado, plcVivo, salidas) {
  for (const cinta of Object.values(cintas)) cinta.actualizar(h);
  desviador.actualizar(salidas ? h : 0);
  stopper.actualizar(h);
  baliza.actualizar(h);

  const contextoPlc = plcVivo ? {
    modoRuteo: estado.holdingRegisters?.modoRuteo ?? 0,
    ultimoSku: estado.inputRegisters?.ultimoSku ?? 0,
  } : null;

  const eventos = modelo.paso(h, salidas, desviador.posicion, plcVivo && estado.inputs.selectorDestinoB, contextoPlc);

  if (eventos.escaneo) {
    cliente.enviar({ target: 'skuEscaneado', action: 'write', value: eventos.escaneo.sku });
    panel.registrar(
      `Escáner/Báscula (%MW1): ${eventos.escaneo.etiqueta} → ${eventos.escaneo.sku === 99 ? 'NO_READ' : `Ruta ${eventos.escaneo.sku === 2 ? 'B' : 'A'}`}`,
      eventos.escaneo.sku === 99 ? 'aviso' : 'info',
    );
  }
  if (eventos.sensor !== undefined) {
    cliente.enviar({ target: 'sensorEntrada', action: 'set', value: eventos.sensor });
  }
  for (const [rama, ocupado] of Object.entries(eventos.sensoresSalida)) {
    cliente.enviar({ target: SENALES_SALIDA[rama], action: 'set', value: ocupado });
  }
  for (const { rama, noDisponible } of eventos.estibas) {
    cliente.enviar({ target: SENALES_ESTIBA[rama], action: 'set', value: noDisponible });
    if (noDisponible && modelo.estibas[rama].estado === 'llena') {
      panel.registrar(`Estiba ${rama} llena: el PLC detiene la línea`, 'aviso');
    } else if (!noDisponible) {
      panel.registrar(`Estiba ${rama} vacía en posición`);
    }
  }
  for (const { id, rama, destinoEsperado, correcto, desbordado } of eventos.despachados) {
    if (!correcto) panel.registrar(`Paquete #${id} por ruta ${rama}; se esperaba ${destinoEsperado}`, 'alarma');
    else if (desbordado) panel.registrar(`Paquete #${id} al suelo: estiba ${rama} no disponible`, 'aviso');
    else panel.registrar(`Paquete #${id} confirmado por %IX${rama === 'A' ? '0.7' : '1.0'} y apilado en ${rama}`);
  }
  for (const { rama, numero, unidades, completa } of eventos.retiradas) {
    panel.registrar(`Estiba ${rama} n.º ${numero} retirada: ${unidades} paquetes${completa ? '' : ' (parcial)'}`);
  }

  const lineaActiva = plcVivo && ['ESPERANDO_PAQUETE', 'CLASIFICANDO_RUTA_A', 'CLASIFICANDO_RUTA_B'].includes(estado.systemStatus);
  if (panel.alimentacionAutomatica && lineaActiva && modelo.enTransporte < MAX_PAQUETES_AUTO && modelo.hayEspacioParaGenerar()) {
    tiempoParaAuto += h;
    if (tiempoParaAuto >= ESPERA_ALIMENTACION) {
      generarPaquete();
      tiempoParaAuto = 0;
    }
  } else {
    tiempoParaAuto = 0;
  }
}

alActualizar((dt) => {
  const estado = cliente.ultimoEstado;
  const plcVivo = cliente.conectado && estado?.plcConnected === true;
  const salidas = plcVivo ? estado.outputs : null;

  cintas.entrada.setActiva(Boolean(salidas?.cintaEntrada));
  cintas.zona.setActiva(Boolean(salidas?.cintaEntrada));
  cintas.salidaA.setActiva(Boolean(salidas?.cintaSalidaA));
  cintas.salidaB.setActiva(Boolean(salidas?.cintaSalidaB));
  stopper.setActivo(Boolean(salidas?.frenoAdmision));
  if (salidas) desviador.setObjetivoB(salidas.desviadorActivo);
  baliza.setActiva(Boolean(salidas?.balizaAlarma));
  baliza.setCambioEstiba(Boolean(salidas?.senalCambioEstiba));
  baliza.setVerde(Boolean(salidas?.balizaVerde));

  const subpasos = Math.max(1, Math.ceil(dt / SUBPASO_MAXIMO));
  for (let i = 0; i < subpasos; i++) pasoSimulacion(dt / subpasos, estado, plcVivo, salidas);
  if (resincronizarSensor && plcVivo) {
    resincronizarSenales(estado);
    resincronizarSensor = false;
  }

  paquetes.sincronizar();
  sensor.mostrar(modelo.sensorOcupado, plcVivo && estado.inputs.sensorEntrada);
  sensoresSalida.A.mostrar(modelo.sensoresSalidaOcupados.A, plcVivo && estado.inputs.sensorSalidaA);
  sensoresSalida.B.mostrar(modelo.sensoresSalidaOcupados.B, plcVivo && estado.inputs.sensorSalidaB);
  etiquetas.actualizar(valoresEtiquetas(salidas, estado));

  explicadorPlc.actualizar({
    estado: cliente.conectado ? estado : null,
    contadores: modelo.contadores,
    criterioSorting: modelo.criterioSorting,
    umbralPesoKg: modelo.umbralPesoKg,
    ultimoEscaneo: modelo.ultimoEscaneo,
  });

  panel.mostrar({
    wsConectado: cliente.conectado,
    estado: cliente.conectado ? estado : null,
    contadores: modelo.contadores,
    hayEspacio: modelo.hayEspacioParaGenerar(),
    enColaEntrada: modelo.enColaEntrada,
    atascoActivo: modelo.atascoActivo,
    intervaloMs,
    estibas: Object.fromEntries(['A', 'B'].map((rama) => {
      const estiba = modelo.estibas[rama];
      return [rama, {
        numero: estiba.numero,
        carga: estiba.paquetes.length,
        capacidad: estiba.capacidad,
        estado: estiba.estado,
        puedeCambiar: modelo.puedeCambiarEstiba(rama),
      }];
    })),
  });
});
