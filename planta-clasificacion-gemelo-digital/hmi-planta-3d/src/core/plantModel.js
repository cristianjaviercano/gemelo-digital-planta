// Modelo cinemático de la planta (capa C3, docs/01 §2): geometría, recorrido de
// los paquetes y emulación del sensor óptico por intersección AABB. No dibuja
// nada (solo matemática de Three.js), así que se prueba en Node.
// La HMI traduce salidas %QX en movimiento; nunca decide transiciones de proceso.
import { Box3, Vector3 } from 'three';

// Geometría definitiva de la Fase 4 (docs/01 §3.2). Unidades: m y s.
// Ejes: x en el sentido de avance de la entrada, y vertical, z lateral (ruta B hacia +z).
export const GEOMETRIA = Object.freeze({
  vCinta: 0.6,                       // v_c
  alturaTransporte: 0.8,             // cota de la superficie de las cintas
  anchoCinta: 0.45,
  paquete: Object.freeze({ largo: 0.3, ancho: 0.25, alto: 0.2 }),
  separacionMinima: 0.05,            // hueco mínimo entre paquetes del mismo carril
  xInicioEntrada: -2.4,
  xSensor: 0,                        // fin de la cinta de entrada e inicio de la zona de desvío
  xDecision: 0.1,                    // donde el paquete sigue recto (A) o la paleta lo guía (B)
  largoZonaDesvio: 0.65,             // L_d
  largoSalida: 1.5,                  // L_s, igual para A y B
  anguloRutaB: Math.PI / 4,
  tramoZonaB: 0.5,                   // recorrido diagonal dentro de la zona hacia la salida B
  tClasificacion: 4,                 // GVL_Param.T_CLASIFICACION que esta geometría debe respetar
  // Estibas de salida (docs/08 §2): 1,2 m en el sentido de la ruta × 1,0 m × 0,144 m
  estiba: Object.freeze({ largo: 1.2, ancho: 1.0, alto: 0.144, distancia: 0.75 }),
  capacidadEstiba: 12,               // por defecto; ajustable de 1 a 48
  tiempoColocacion: 0.6,             // s desde el borde de la cinta hasta su posición en la estiba
  tiempoCambioEstiba: 3,             // s: sale la estiba llena y entra una vacía
});

const G = GEOMETRIA;
const GRAVEDAD = 9.81;
const DURACION_CAIDA = 1.2;          // s que un paquete desbordado permanece visible en el suelo
const POSICIONES_POR_CAPA = 16;      // 4 × 4: el paquete cabe justo 4 veces a lo largo y 4 a lo ancho
export const CAPACIDAD_MAXIMA_ESTIBA = 48;   // tres capas: la carga queda por debajo de las cintas
const ALTURA_ARCO = 0.25;            // m que sube la trayectoria de colocación sobre la recta
const RECORRIDO_CAMBIO = 2.2;        // m que se desplaza la estiba al salir o entrar

// Cada cinta física se mueve con una salida del PLC; la zona de desvío la arrastra el motor de entrada
export const MOTOR_DE_CINTA = Object.freeze({
  entrada: 'cintaEntrada',
  zona: 'cintaEntrada',
  salidaA: 'cintaSalidaA',
  salidaB: 'cintaSalidaB',
});

const punto = (x, z) => new Vector3(x, 0, z);
const direccionB = punto(Math.cos(G.anguloRutaB), Math.sin(G.anguloRutaB));
const xGeneracion = G.xInicioEntrada + G.paquete.largo / 2 + 0.05;
const puntoDecision = punto(G.xDecision, 0);
const finZonaA = punto(G.xSensor + G.largoZonaDesvio, 0);
const finZonaB = puntoDecision.clone().addScaledVector(direccionB, G.tramoZonaB);

// Recorridos como tramos rectos sobre el plano x–z, cada uno sobre una cinta
export const TRAMOS = Object.freeze({
  comun: [
    { desde: punto(xGeneracion, 0), hasta: punto(G.xSensor, 0), cinta: 'entrada' },
    { desde: punto(G.xSensor, 0), hasta: puntoDecision, cinta: 'zona' },
  ],
  A: [
    { desde: puntoDecision, hasta: finZonaA, cinta: 'zona' },
    { desde: finZonaA, hasta: punto(finZonaA.x + G.largoSalida, 0), cinta: 'salidaA' },
  ],
  B: [
    { desde: puntoDecision, hasta: finZonaB, cinta: 'zona' },
    { desde: finZonaB, hasta: finZonaB.clone().addScaledVector(direccionB, G.largoSalida), cinta: 'salidaB' },
  ],
});

const tramosDe = (rama) => (rama ? [...TRAMOS.comun, ...TRAMOS[rama]] : TRAMOS.comun);
const longitud = (tramos) => tramos.reduce((suma, t) => suma + t.desde.distanceTo(t.hasta), 0);

export const S_SENSOR = G.xSensor - xGeneracion;
export const S_DECISION = longitud(TRAMOS.comun);
export const S_FIN = Object.freeze({ A: longitud(tramosDe('A')), B: longitud(tramosDe('B')) });

// Tiempo desde que el frente del paquete corta el haz hasta que su centro sale
// por el extremo de la cinta de salida. Debe ser menor que T_clas (docs/01 §3.2).
export function tiempoDespeje(rama) {
  return (S_FIN[rama] - (S_SENSOR - G.paquete.largo / 2)) / G.vCinta;
}

// Posición del centro, rumbo y cinta bajo el paquete en la abscisa curvilínea s
export function ubicar(rama, s) {
  const tramos = tramosDe(rama);
  let restante = s;
  for (const [i, tramo] of tramos.entries()) {
    const largo = tramo.desde.distanceTo(tramo.hasta);
    if (restante <= largo || i === tramos.length - 1) {
      const direccion = tramo.hasta.clone().sub(tramo.desde).normalize();
      return {
        posicion: tramo.desde.clone().addScaledVector(direccion, Math.min(restante, largo)),
        rumbo: Math.atan2(direccion.z, direccion.x),
        cinta: tramo.cinta,
      };
    }
    restante -= largo;
  }
}

// Volumen del haz del sensor fotoeléctrico (%IX0.3), atravesando la cinta en x = xSensor
export const HAZ_SENSOR = new Box3(
  new Vector3(G.xSensor - 0.005, G.alturaTransporte + 0.05, -G.anchoCinta / 2 - 0.06),
  new Vector3(G.xSensor + 0.005, G.alturaTransporte + 0.12, G.anchoCinta / 2 + 0.06),
);

// Lado (±normal) por el que entra la estiba vacía: el opuesto a la otra estiba,
// para que en el cambio no atraviese su carga (la normal de A apunta hacia B)
const LADO_ENTRADA = Object.freeze({ A: -1, B: 1 });

// Estibas al final de cada salida: centro, sentido de la ruta, normal (lado +z
// local, el mismo convenio de las cintas), rumbo y sentido de entrada en el cambio
export const ESTIBAS = Object.freeze(Object.fromEntries(['A', 'B'].map((rama) => {
  const tramo = TRAMOS[rama].at(-1);
  const direccion = tramo.hasta.clone().sub(tramo.desde).normalize();
  const normal = new Vector3(-direccion.z, 0, direccion.x);
  return [rama, Object.freeze({
    centro: tramo.hasta.clone().addScaledVector(direccion, G.estiba.distancia),
    direccion,
    normal,
    entrada: normal.clone().multiplyScalar(LADO_ENTRADA[rama]),
    rumbo: Math.atan2(direccion.z, direccion.x),
  })];
})));

// Centro del paquete n-ésimo (0-based) sobre su estiba: patrón 4 × 4 por capa,
// fila a fila desde el extremo lejano y desde el lado −normal, capa a capa
export function posicionEnEstiba(rama, indice) {
  const { centro, direccion, normal } = ESTIBAS[rama];
  const capa = Math.floor(indice / POSICIONES_POR_CAPA);
  const enCapa = indice % POSICIONES_POR_CAPA;
  const fila = Math.floor(enCapa / 4);
  const columna = 3 - (enCapa % 4);
  const a = -G.estiba.largo / 2 + G.paquete.largo / 2 + columna * G.paquete.largo;
  const b = -G.estiba.ancho / 2 + G.paquete.ancho / 2 + fila * G.paquete.ancho;
  return centro.clone()
    .addScaledVector(direccion, a)
    .addScaledVector(normal, b)
    .setY(G.estiba.alto + G.paquete.alto / 2 + capa * G.paquete.alto);
}

const suavizar = (u) => u * u * (3 - 2 * u);
const nuevaEstiba = (numero, capacidad) => ({ numero, capacidad, paquetes: [], enCamino: 0, estado: 'disponible', cambio: null });

// AABB del paquete: con rumbo distinto de 0 la caja alineada a los ejes crece
function cajaDe(paquete) {
  const { largo, ancho, alto } = G.paquete;
  const c = Math.abs(Math.cos(paquete.rumbo));
  const s = Math.abs(Math.sin(paquete.rumbo));
  const mitad = new Vector3((c * largo + s * ancho) / 2, alto / 2, (s * largo + c * ancho) / 2);
  return new Box3(paquete.posicion.clone().sub(mitad), paquete.posicion.clone().add(mitad));
}

const DISTANCIA_MINIMA = G.paquete.largo + G.separacionMinima;

// Dos paquetes comparten carril antes de la bifurcación, en la misma rama, o
// mientras el de delante aún está junto a la bifurcación
const compartenCarril = (detras, delante) =>
  delante.rama === null || detras.rama === delante.rama || delante.s - S_DECISION < DISTANCIA_MINIMA;

export class ModeloPlanta {
  paquetes = [];                     // sobre las cintas, en vuelo hacia la estiba o desbordados
  sensorOcupado = false;
  capacidadSiguiente = G.capacidadEstiba;
  estibas = { A: nuevaEstiba(1, G.capacidadEstiba), B: nuevaEstiba(1, G.capacidadEstiba) };
  contadores = { generados: 0, A: 0, B: 0, malClasificados: 0, estibasCompletadas: { A: 0, B: 0 }, desbordes: 0 };
  #siguienteId = 1;
  #senalEstiba = { A: false, B: false };

  hayEspacioParaGenerar() {
    return this.paquetes.every((p) => p.caida || p.colocacion || p.s >= DISTANCIA_MINIMA);
  }

  // Paquetes aún sobre las cintas (los que vuelan a la estiba o caen ya no cuentan)
  get enTransporte() {
    return this.paquetes.filter((p) => !p.caida && !p.colocacion).length;
  }

  generarPaquete() {
    if (!this.hayEspacioParaGenerar()) return null;
    const paquete = {
      id: this.#siguienteId++, s: 0, rama: null, destinoEsperado: null, malClasificado: false, caida: null, colocacion: null,
    };
    this.#colocar(paquete);
    this.paquetes.push(paquete);
    this.contadores.generados += 1;
    return paquete;
  }

  // Señal de planta de cada estiba (coils 5 y 6): llena o en cambio (docs/08 §2.2)
  estibaNoDisponible(rama) {
    return this.estibas[rama].estado !== 'disponible';
  }

  // La capacidad nueva rige para las estibas que se coloquen desde ahora; una
  // estiba vacía todavía sin paquetes en camino la adopta de inmediato
  fijarCapacidad(valor) {
    const capacidad = Math.min(CAPACIDAD_MAXIMA_ESTIBA, Math.max(1, Math.round(valor)));
    this.capacidadSiguiente = capacidad;
    for (const estiba of Object.values(this.estibas)) {
      if (estiba.estado === 'disponible' && estiba.paquetes.length === 0 && estiba.enCamino === 0) estiba.capacidad = capacidad;
    }
    return capacidad;
  }

  puedeCambiarEstiba(rama) {
    const estiba = this.estibas[rama];
    return estiba.estado !== 'cambiando' && estiba.enCamino === 0 && (estiba.estado === 'llena' || estiba.paquetes.length > 0);
  }

  cambiarEstiba(rama) {
    if (!this.puedeCambiarEstiba(rama)) return false;
    const estiba = this.estibas[rama];
    estiba.cambio = { t: 0, completa: estiba.estado === 'llena', unidades: estiba.paquetes.length };
    estiba.estado = 'cambiando';
    return true;
  }

  // Centro actual de la estiba: se aleja por la ruta en la primera mitad del
  // cambio y la vacía entra por el costado libre en la segunda
  poseEstiba(rama) {
    const { centro, direccion, entrada } = ESTIBAS[rama];
    const cambio = this.estibas[rama].cambio;
    if (!cambio) return centro.clone();
    const mitad = G.tiempoCambioEstiba / 2;
    if (cambio.t < mitad) return centro.clone().addScaledVector(direccion, suavizar(cambio.t / mitad) * RECORRIDO_CAMBIO);
    return centro.clone().addScaledVector(entrada, (1 - suavizar(Math.min((cambio.t - mitad) / mitad, 1))) * RECORRIDO_CAMBIO);
  }

  // Avanza dt segundos. `salidas` son los outputs del contrato, o null si el PLC
  // no está vivo: entonces las cintas se congelan (degradación segura, docs/02 §4.1).
  // `paletaEnB` es la posición del desviador (0 = A, 1 = B); `selectorB`, el
  // readback del selector, con el que se anota el destino esperado al cortar el haz.
  // La colocación en la estiba y su cambio siguen aunque falte el PLC: no los mueve un motor.
  paso(dt, salidas, paletaEnB, selectorB) {
    const eventos = { sensor: undefined, despachados: [], depositados: [], estibas: [], retiradas: [] };
    if (salidas) this.#avanzar(dt, salidas, paletaEnB, eventos);
    this.#animarCaidas(dt);
    this.#animarColocaciones(dt, eventos);
    this.#animarCambios(dt, eventos);

    const enHaz = this.paquetes.filter((p) => !p.caida && !p.colocacion && cajaDe(p).intersectsBox(HAZ_SENSOR));
    const ocupado = enHaz.length > 0;
    if (ocupado !== this.sensorOcupado) {
      this.sensorOcupado = ocupado;
      eventos.sensor = ocupado;
    }
    // El PLC muestrea el selector en el flanco del sensor (P5): ese es el destino esperado
    for (const paquete of enHaz) {
      if (paquete.destinoEsperado === null) paquete.destinoEsperado = selectorB ? 'B' : 'A';
    }
    for (const rama of ['A', 'B']) {
      const noDisponible = this.estibaNoDisponible(rama);
      if (noDisponible !== this.#senalEstiba[rama]) {
        this.#senalEstiba[rama] = noDisponible;
        eventos.estibas.push({ rama, noDisponible });
      }
    }
    return eventos;
  }

  #avanzar(dt, salidas, paletaEnB, eventos) {
    const sobreCintas = this.paquetes.filter((p) => !p.caida && !p.colocacion).sort((a, b) => b.s - a.s);
    const delanteros = [];
    for (const paquete of sobreCintas) {
      const { cinta } = ubicar(paquete.rama, paquete.s);
      let destino = paquete.s + (salidas[MOTOR_DE_CINTA[cinta]] ? G.vCinta * dt : 0);
      for (const delante of delanteros) {
        if (compartenCarril(paquete, delante)) destino = Math.min(destino, delante.s - DISTANCIA_MINIMA);
      }
      paquete.s = Math.max(paquete.s, destino);

      // La ruta la decide la posición física de la paleta al llegar a la bifurcación
      if (paquete.rama === null && paquete.s >= S_DECISION) paquete.rama = paletaEnB >= 0.5 ? 'B' : 'A';

      if (paquete.rama && paquete.s >= S_FIN[paquete.rama]) this.#despachar(paquete, eventos);
      else this.#colocar(paquete);
      delanteros.push(paquete);
    }
  }

  // Al salir de la cinta el paquete se dirige a la siguiente posición libre de su
  // estiba; si la estiba no está disponible o no le queda capacidad, cae al suelo
  #despachar(paquete, eventos) {
    paquete.s = S_FIN[paquete.rama];
    this.#colocar(paquete);
    paquete.malClasificado = paquete.destinoEsperado !== null && paquete.destinoEsperado !== paquete.rama;
    this.contadores[paquete.rama] += 1;
    if (paquete.malClasificado) this.contadores.malClasificados += 1;

    const estiba = this.estibas[paquete.rama];
    const ocupadas = estiba.paquetes.length + estiba.enCamino;
    if (estiba.estado === 'disponible' && ocupadas < estiba.capacidad) {
      estiba.enCamino += 1;
      paquete.colocacion = { t: 0, origen: paquete.posicion.clone(), destino: posicionEnEstiba(paquete.rama, ocupadas), indice: ocupadas };
    } else {
      paquete.caida = { t: 0, origen: paquete.posicion.clone() };
      this.contadores.desbordes += 1;
    }
    eventos.despachados.push({
      id: paquete.id,
      rama: paquete.rama,
      destinoEsperado: paquete.destinoEsperado,
      correcto: !paquete.malClasificado,
      desbordado: Boolean(paquete.caida),
    });
  }

  // Trayectoria de colocación: interpolación suavizada hasta la posición con un
  // arco vertical, como la deja un paletizador
  #animarColocaciones(dt, eventos) {
    const colocados = [];
    for (const paquete of this.paquetes) {
      const colocacion = paquete.colocacion;
      if (!colocacion) continue;
      colocacion.t += dt;
      const u = Math.min(colocacion.t / G.tiempoColocacion, 1);
      paquete.posicion.lerpVectors(colocacion.origen, colocacion.destino, suavizar(u));
      paquete.posicion.y += ALTURA_ARCO * 4 * u * (1 - u);
      if (u >= 1) colocados.push(paquete);
    }
    for (const paquete of colocados) {
      const estiba = this.estibas[paquete.rama];
      estiba.enCamino -= 1;
      estiba.paquetes.push({
        id: paquete.id, posicion: paquete.colocacion.destino.clone(), rumbo: paquete.rumbo, malClasificado: paquete.malClasificado,
      });
      if (estiba.paquetes.length >= estiba.capacidad) estiba.estado = 'llena';
      eventos.depositados.push({ id: paquete.id, rama: paquete.rama, posicion: paquete.colocacion.indice, estiba: estiba.numero });
    }
    if (colocados.length) this.paquetes = this.paquetes.filter((p) => !colocados.includes(p));
  }

  // Cambio de estiba: a mitad del recorrido la llena se retira y entra una vacía
  #animarCambios(dt, eventos) {
    const mitad = G.tiempoCambioEstiba / 2;
    for (const [rama, estiba] of Object.entries(this.estibas)) {
      const cambio = estiba.cambio;
      if (!cambio) continue;
      const antes = cambio.t;
      cambio.t += dt;
      if (antes < mitad && cambio.t >= mitad) {
        if (cambio.completa) this.contadores.estibasCompletadas[rama] += 1;
        eventos.retiradas.push({ rama, numero: estiba.numero, unidades: cambio.unidades, completa: cambio.completa });
        estiba.numero += 1;
        estiba.paquetes = [];
        estiba.capacidad = this.capacidadSiguiente;
      }
      if (cambio.t >= G.tiempoCambioEstiba) {
        estiba.cambio = null;
        estiba.estado = 'disponible';
      }
    }
  }

  // Desborde: caída balística al suelo junto a la estiba no disponible
  #animarCaidas(dt) {
    const suelo = G.paquete.alto / 2;
    for (const paquete of this.paquetes) {
      if (!paquete.caida) continue;
      const caida = paquete.caida;
      caida.t += dt;
      const avance = G.vCinta * Math.min(caida.t, 0.35);
      paquete.posicion.set(
        caida.origen.x + Math.cos(paquete.rumbo) * avance,
        Math.max(suelo, caida.origen.y - 0.5 * GRAVEDAD * caida.t ** 2),
        caida.origen.z + Math.sin(paquete.rumbo) * avance,
      );
    }
    this.paquetes = this.paquetes.filter((p) => !p.caida || p.caida.t < DURACION_CAIDA);
  }

  #colocar(paquete) {
    const { posicion, rumbo } = ubicar(paquete.rama, paquete.s);
    paquete.posicion = posicion.setY(G.alturaTransporte + G.paquete.alto / 2);
    paquete.rumbo = rumbo;
  }
}
