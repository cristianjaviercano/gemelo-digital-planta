// HMI/SCADA 3D (capa C3): monta la planta, la conecta al middleware y, en cada
// fotograma, traduce las salidas del PLC en movimiento y emula el sensor.
import { Vector3 } from 'three';
import { crearEscena } from './core/sceneManager.js';
import { ClienteMiddleware, urlMiddleware } from './core/wsClient.js';
import { ESTIBAS, GEOMETRIA, ModeloPlanta, TRAMOS, tiempoDespeje } from './core/plantModel.js';
import { crearCinta } from './components3d/conveyorBelt.js';
import { crearDesviador } from './components3d/diverterMechanism.js';
import { crearBaliza, crearSensor } from './components3d/sensorsAndBeacons.js';
import { crearGestorPaquetes } from './components3d/packageSpawner.js';
import { crearArmarioControl } from './components3d/modelos_3d/index.js';
import { crearEtiquetas } from './ui/hudLabels.js';
import { crearPanel } from './ui/operatorPanel.js';

const G = GEOMETRIA;
const ESPERA_ALIMENTACION = 1;   // s entre un despacho y el siguiente paquete automático

// ------------------------------------------------------------------ planta 3D --
const { escena, alActualizar, reiniciarVista } = crearEscena(document.querySelector('#escena'));
const modelo = new ModeloPlanta();
const cintas = {
  entrada: crearCinta({ nombre: 'cinta-entrada', desde: new Vector3(G.xInicioEntrada, 0, 0), hasta: new Vector3(G.xSensor, 0, 0) }),
  // La zona de desvío es más ancha hacia +z para dar paso a la ruta B, sin larguero en ese lado
  zona: crearCinta({
    nombre: 'zona-desvio', desde: new Vector3(G.xSensor, 0, 0), hasta: new Vector3(G.xSensor + G.largoZonaDesvio, 0, 0),
    ancho: 0.62, desfaseZ: 0.085, conMotor: false, largueros: [-1], cota: -0.006,
  }),
  salidaA: crearCinta({ nombre: 'salida-a', desde: TRAMOS.A[1].desde, hasta: TRAMOS.A[1].hasta }),
  salidaB: crearCinta({ nombre: 'salida-b', desde: TRAMOS.B[1].desde, hasta: TRAMOS.B[1].hasta }),
};
const desviador = crearDesviador();
const sensor = crearSensor();
const baliza = crearBaliza(new Vector3(-0.6, 0, -0.8));
const armario = crearArmarioControl();
armario.position.set(-1.6, 0, -0.9);
armario.rotation.y = Math.PI / 10;
escena.add(...Object.values(cintas).map((c) => c.grupo), desviador.grupo, sensor.grupo, baliza.grupo, armario);
const paquetes = crearGestorPaquetes(escena, modelo);

const etiquetas = crearEtiquetas(escena, [
  { clave: 'entrada', punto: cintas.entrada.puntoEtiqueta, direccion: 'Q0 · %QX0.0', titulo: 'Cinta de entrada' },
  { clave: 'sensor', punto: sensor.puntoEtiqueta, direccion: 'I3 · %IX0.3', titulo: 'Sensor de entrada' },
  { clave: 'desviador', punto: desviador.puntoEtiqueta, direccion: 'Q1 · %QX0.1', titulo: 'Desviador' },
  { clave: 'salidaA', punto: cintas.salidaA.puntoEtiqueta, direccion: 'Q2 · %QX0.2', titulo: 'Salida A' },
  { clave: 'salidaB', punto: cintas.salidaB.puntoEtiqueta, direccion: 'Q3 · %QX0.3', titulo: 'Salida B' },
  { clave: 'baliza', punto: baliza.puntoEtiqueta, direccion: 'Q4 · %QX0.4', titulo: 'Baliza de alarma' },
  { clave: 'senalEstiba', punto: baliza.puntoEtiquetaAmbar, direccion: 'Q6 · %QX0.6', titulo: 'Señal de cambio de estiba' },
  { clave: 'armario', punto: new Vector3(-1.6, 1.6, -0.9), direccion: 'C1 · IEC 61131-3', titulo: 'Armario PLC' },
  ...['A', 'B'].map((rama, i) => ({
    clave: `estiba${rama}`,
    punto: ESTIBAS[rama].centro.clone().setY(1.05),
    direccion: `I${5 + i} · %IX0.${5 + i}`,
    titulo: `Estiba ${rama}`,
  })),
]);

// ----------------------------------------------------------- middleware y panel --
const urlWs = urlMiddleware();
const cliente = new ClienteMiddleware(urlWs);
const panel = crearPanel(document.querySelector('#panel'), document.querySelector('#aviso-escena'), {
  urlWs,
  parametros: { ...G, despejeA: tiempoDespeje('A'), despejeB: tiempoDespeje('B') },
  autoInicial: new URLSearchParams(window.location.search).get('auto') === '1',
  alOrdenar: (comando) => cliente.enviar(comando),
  alGenerarPaquete: () => generarPaquete(),
  alCambiarEtiquetas: (visibles) => etiquetas.setVisibles(visibles),
  alReiniciarVista: reiniciarVista,
  alCambiarEstiba: (rama) => {
    if (modelo.cambiarEstiba(rama)) panel.registrar(`Cambio de la estiba ${rama} en curso`);
    else panel.registrar(`La estiba ${rama} no se puede cambiar ahora`, 'aviso');
  },
  alCambiarCapacidad: (valor) => {
    const capacidad = modelo.fijarCapacidad(valor);
    panel.registrar(`Capacidad por estiba: ${capacidad} paquetes`);
    return capacidad;
  },
});

function generarPaquete() {
  const paquete = modelo.generarPaquete();
  if (paquete) panel.registrar(`Paquete ${paquete.id} en la cinta de entrada`);
  else panel.registrar('Entrada ocupada: esperar a que avance el paquete', 'aviso');
}

// Señales de planta que emula la HMI: sensor de entrada y estibas no disponibles.
// Tras (re)conectar se comparan con el readback del PLC y se reenvían si difieren.
const SENALES_ESTIBA = { A: 'estibaLlenaA', B: 'estibaLlenaB' };
let resincronizarSensor = true;

function resincronizarSenales(estado) {
  const pendientes = [['sensorEntrada', modelo.sensorOcupado]];
  for (const [rama, target] of Object.entries(SENALES_ESTIBA)) pendientes.push([target, modelo.estibaNoDisponible(rama)]);
  for (const [target, valor] of pendientes) {
    if (estado.inputs[target] !== valor) cliente.enviar({ target, action: 'set', value: valor });
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
    if (estado.systemStatus === 'PARADA_EMERGENCIA') panel.registrar('Parada de emergencia', 'alarma');
    statusPrevio = estado.systemStatus;
  }
});

const encendido = (valor) => (valor ? { texto: 'ON', nivel: 'on' } : { texto: 'OFF', nivel: 'off' });

function valoresEtiquetas(salidas, estado) {
  const ocupacion = modelo.sensorOcupado ? 'ocupado' : 'libre';
  if (!salidas) {
    const sinDato = { texto: 'sin dato', nivel: 'nd' };
    return {
      entrada: sinDato, desviador: sinDato, salidaA: sinDato, salidaB: sinDato, baliza: sinDato, senalEstiba: sinDato,
      armario: sinDato,
      sensor: { texto: `${ocupacion} · PLC sin dato`, nivel: 'nd' },
      ...valoresEstibas(null),
    };
  }
  return {
    entrada: encendido(salidas.cintaEntrada),
    sensor: { texto: `${ocupacion} · PLC lee ${Number(estado.inputs.sensorEntrada)}`, nivel: estado.inputs.sensorEntrada ? 'on' : 'off' },
    desviador: { texto: salidas.desviadorActivo ? '→ ruta B' : '→ ruta A', nivel: salidas.desviadorActivo ? 'on' : 'off' },
    salidaA: encendido(salidas.cintaSalidaA),
    salidaB: encendido(salidas.cintaSalidaB),
    baliza: salidas.balizaAlarma ? { texto: 'ALARMA', nivel: 'alarma' } : { texto: 'OFF', nivel: 'off' },
    senalEstiba: salidas.senalCambioEstiba ? { texto: 'ON', nivel: 'aviso' } : { texto: 'OFF', nivel: 'off' },
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
    const leido = estado ? ` · PLC lee ${Number(estado.inputs[SENALES_ESTIBA[rama]])}` : '';
    const texto = `${estiba.paquetes.length}/${estiba.capacidad} ${estiba.estado === 'cambiando' ? 'en cambio' : estiba.estado}${leido}`;
    valores[`estiba${rama}`] = { texto, nivel: estiba.estado === 'disponible' ? 'off' : 'aviso' };
  }
  return valores;
}

// -------------------------------------------------------------- ciclo por fotograma --
// Un fotograma largo (pestaña lenta, captura de pantalla) se simula en subpasos
// cortos: la planta no pierde tiempo frente al temporizador del PLC ni salta el haz
const SUBPASO_MAXIMO = 0.05;   // s (docs/07 §8.3)
let tiempoSinPaquetes = 0;

function pasoSimulacion(h, estado, plcVivo, salidas) {
  for (const cinta of Object.values(cintas)) cinta.actualizar(h);
  desviador.actualizar(salidas ? h : 0);
  baliza.actualizar(h);

  const eventos = modelo.paso(h, salidas, desviador.posicion, plcVivo && estado.inputs.selectorDestinoB);

  // Emulación del sensor (%IX0.3): se envía cada cambio de ocupación del haz
  if (eventos.sensor !== undefined) {
    cliente.enviar({ target: 'sensorEntrada', action: 'set', value: eventos.sensor });
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
    if (!correcto) panel.registrar(`Paquete ${id} por la ruta ${rama}; se esperaba ${destinoEsperado}`, 'alarma');
    else if (desbordado) panel.registrar(`Paquete ${id} al suelo: estiba ${rama} no disponible`, 'aviso');
    else panel.registrar(`Paquete ${id} despachado por la ruta ${rama}`);
  }
  for (const { rama, numero, unidades, completa } of eventos.retiradas) {
    panel.registrar(`Estiba ${rama} n.º ${numero} retirada: ${unidades} paquetes${completa ? '' : ' (parcial)'}`);
  }

  // Alimentación automática: un paquete a la vez (hipótesis H1, docs/01 §3.7) y solo
  // cuando el PLC espera paquete; con la línea bloqueada no se acumulan cajas
  if (panel.alimentacionAutomatica && plcVivo && estado.systemStatus === 'ESPERANDO_PAQUETE' && modelo.enTransporte === 0) {
    tiempoSinPaquetes += h;
    if (tiempoSinPaquetes >= ESPERA_ALIMENTACION) {
      generarPaquete();
      tiempoSinPaquetes = 0;
    }
  } else {
    tiempoSinPaquetes = 0;
  }
}

alActualizar((dt) => {
  const estado = cliente.ultimoEstado;
  const plcVivo = cliente.conectado && estado?.plcConnected === true;
  // Sin PLC vivo todo se congela (docs/02 §4.1); la paleta conserva su posición
  const salidas = plcVivo ? estado.outputs : null;

  cintas.entrada.setActiva(Boolean(salidas?.cintaEntrada));
  cintas.zona.setActiva(Boolean(salidas?.cintaEntrada));
  cintas.salidaA.setActiva(Boolean(salidas?.cintaSalidaA));
  cintas.salidaB.setActiva(Boolean(salidas?.cintaSalidaB));
  if (salidas) desviador.setObjetivoB(salidas.desviadorActivo);
  baliza.setActiva(Boolean(salidas?.balizaAlarma));
  baliza.setCambioEstiba(Boolean(salidas?.senalCambioEstiba));

  const subpasos = Math.max(1, Math.ceil(dt / SUBPASO_MAXIMO));
  for (let i = 0; i < subpasos; i++) pasoSimulacion(dt / subpasos, estado, plcVivo, salidas);
  if (resincronizarSensor && plcVivo) {
    resincronizarSenales(estado);
    resincronizarSensor = false;
  }

  paquetes.sincronizar();
  sensor.mostrar(modelo.sensorOcupado, plcVivo && estado.inputs.sensorEntrada);
  etiquetas.actualizar(valoresEtiquetas(salidas, estado));
  panel.mostrar({
    wsConectado: cliente.conectado,
    estado: cliente.conectado ? estado : null,
    contadores: modelo.contadores,
    hayEspacio: modelo.hayEspacioParaGenerar(),
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

// Acceso de depuración en desarrollo (consola del navegador y pruebas automatizadas)
if (import.meta.env.DEV) window.__planta = { modelo, cliente, desviador };
