// Modelo cinemático de la planta (capa C3, docs/01 §2): geometría, recorrido de
// los paquetes, catálogo multiformato 3D (Express, Frágil, Estándar, Pesado, NO_READ),
// reglas de sorting (por Prioridad/SKU o por Peso en báscula dinámica), tope neumático
// indexador (%QX0.7), fotoceldas de entrada (%IX0.3) y salida A/B (%IX0.7, %IX1.0).
import { Box3, Vector3 } from 'three';

export const GEOMETRIA = Object.freeze({
  vCinta: 0.6,                       // v_c (m/s)
  alturaTransporte: 0.8,             // cota de la superficie de las cintas (m)
  anchoCinta: 0.45,
  paquete: Object.freeze({ largo: 0.3, ancho: 0.25, alto: 0.2 }),
  separacionMinima: 0.05,            // hueco mínimo entre paquetes del mismo carril
  xInicioEntrada: -2.4,
  xStopper: -0.22,                   // posición del tope neumático de admisión (%QX0.7)
  xSensor: 0,                        // fin de la cinta de entrada e inicio de la zona de desvío (%IX0.3)
  xDecision: 0.1,                    // donde el paquete sigue recto (A) o la paleta lo guía (B)
  largoZonaDesvio: 0.65,             // L_d
  largoSalida: 1.5,                  // L_s, igual para A y B
  margenSensorSalida: 0.18,          // distancia antes del extremo de salida donde está la fotocelda %IX0.7/%IX1.0
  anguloRutaB: Math.PI / 4,
  tramoZonaB: 0.5,                   // recorrido diagonal dentro de la zona hacia la salida B
  tClasificacion: 4,                 // GVL_Param.T_CLASIFICACION que esta geometría debe respetar
  estiba: Object.freeze({ largo: 1.2, ancho: 1.0, alto: 0.144, distancia: 0.75 }),
  capacidadEstiba: 64,               // 4 niveles completos × 16 cajas por cama (4×4); ajustable de 1 a 96 (6 niveles)
  tiempoColocacion: 0.6,             // s desde el borde de la cinta hasta su posición en la estiba
  tiempoCambioEstiba: 3,             // s: sale la estiba llena y entra una vacía
});

// Catálogo de formatos de paquete para Sorting Industrial y Comercial
// Altura modular estándar (0.20 m) para garantizar paletizado estable de 4 a 6 niveles sin solapes.
export const TIPOS_PAQUETE = Object.freeze({
  express: Object.freeze({
    idTipo: 'express',
    nombre: 'Express Prioritario',
    etiquetaCorta: 'EXPRESS',
    pesoKg: 3.5,
    dimensiones: Object.freeze({ largo: 0.27, ancho: 0.22, alto: 0.20 }),
    skuPrioridad: 1, // Ruta A (Prioritaria / Rápida)
    colorCaja: '#c89f72',
    colorFranja: '#0284c7',
  }),
  fragil: Object.freeze({
    idTipo: 'fragil',
    nombre: 'Frágil / Exportación',
    etiquetaCorta: 'FRÁGIL',
    pesoKg: 6.0,
    dimensiones: Object.freeze({ largo: 0.28, ancho: 0.23, alto: 0.20 }),
    skuPrioridad: 1, // Ruta A (Cuidado / Exportación)
    colorCaja: '#e2e8f0',
    colorFranja: '#0d9488',
  }),
  estandar: Object.freeze({
    idTipo: 'estandar',
    nombre: 'Estándar E-Commerce',
    etiquetaCorta: 'ESTÁNDAR',
    pesoKg: 11.5,
    dimensiones: Object.freeze({ largo: 0.295, ancho: 0.245, alto: 0.20 }),
    skuPrioridad: 2, // Ruta B (Carga Estándar)
    colorCaja: '#b48a5a',
    colorFranja: '#d97706',
  }),
  pesado: Object.freeze({
    idTipo: 'pesado',
    nombre: 'Pesado Industrial',
    etiquetaCorta: 'PESADO',
    pesoKg: 18.0,
    dimensiones: Object.freeze({ largo: 0.30, ancho: 0.25, alto: 0.20 }),
    skuPrioridad: 2, // Ruta B (Carga Pesada)
    colorCaja: '#8c6239',
    colorFranja: '#7c2d12',
  }),
  noread: Object.freeze({
    idTipo: 'noread',
    nombre: 'Etiqueta Dañada (NO_READ)',
    etiquetaCorta: 'NO READ',
    pesoKg: 8.5,
    dimensiones: Object.freeze({ largo: 0.295, ancho: 0.245, alto: 0.20 }),
    skuPrioridad: 99,
    colorCaja: '#b48a5a',
    colorFranja: '#dc2626',
  }),
});

const SECUENCIA_TIPOS_AUTO = ['express', 'estandar', 'fragil', 'pesado'];

const G = GEOMETRIA;
const GRAVEDAD = 9.81;
const DURACION_CAIDA = 1.2;
export const POSICIONES_POR_CAPA = 16;
export const CAPACIDAD_MAXIMA_ESTIBA = 96; // Hasta 6 niveles completos de 16 cajas (4×4)
const ALTURA_ARCO = 0.25;
const RECORRIDO_CAMBIO = 2.2;

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
export const S_STOPPER = S_SENSOR - G.paquete.largo / 2 - 0.06;
export const S_DECISION = longitud(TRAMOS.comun);
export const S_FIN = Object.freeze({ A: longitud(tramosDe('A')), B: longitud(tramosDe('B')) });
export const S_SENSOR_SALIDA = Object.freeze({
  A: S_FIN.A - G.margenSensorSalida,
  B: S_FIN.B - G.margenSensorSalida,
});

export function tiempoDespeje(rama) {
  return (S_FIN[rama] - (S_SENSOR - G.paquete.largo / 2)) / G.vCinta;
}

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

export const HAZ_SENSOR = new Box3(
  new Vector3(G.xSensor - 0.005, G.alturaTransporte + 0.05, -G.anchoCinta / 2 - 0.06),
  new Vector3(G.xSensor + 0.005, G.alturaTransporte + 0.12, G.anchoCinta / 2 + 0.06),
);

export const SENSORES_SALIDA = Object.freeze(Object.fromEntries(['A', 'B'].map((rama) => {
  const { posicion, rumbo } = ubicar(rama, S_SENSOR_SALIDA[rama]);
  const direccion = new Vector3(Math.cos(rumbo), 0, Math.sin(rumbo));
  const normal = new Vector3(-direccion.z, 0, direccion.x);
  return [rama, Object.freeze({
    centro: posicion.clone().setY(G.alturaTransporte + 0.085),
    direccion,
    normal,
    rumbo,
    s: S_SENSOR_SALIDA[rama],
  })];
})));

const LADO_ENTRADA = Object.freeze({ A: -1, B: 1 });

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

function cajaDe(paquete) {
  const { largo, ancho, alto } = G.paquete;
  const c = Math.abs(Math.cos(paquete.rumbo));
  const s = Math.abs(Math.sin(paquete.rumbo));
  const mitad = new Vector3((c * largo + s * ancho) / 2, alto / 2, (s * largo + c * ancho) / 2);
  return new Box3(paquete.posicion.clone().sub(mitad), paquete.posicion.clone().add(mitad));
}

const DISTANCIA_MINIMA = G.paquete.largo + G.separacionMinima;

const compartenCarril = (detras, delante) =>
  delante.rama === null || detras.rama === delante.rama || delante.s - S_DECISION < DISTANCIA_MINIMA;

export class ModeloPlanta {
  paquetes = [];
  sensorOcupado = false;
  sensoresSalidaOcupados = { A: false, B: false };
  atascoActivo = false;
  proximoNoRead = false;
  criterioSorting = 'prioridad'; // 'prioridad' (Express/Frágil→A, Estándar/Pesado→B) | 'peso' (< umbral→A, >= umbral→B)
  umbralPesoKg = 10;
  capacidadSiguiente = G.capacidadEstiba;
  estibas = { A: nuevaEstiba(1, G.capacidadEstiba), B: nuevaEstiba(1, G.capacidadEstiba) };
  contadores = {
    generados: 0,
    A: 0,
    B: 0,
    malClasificados: 0,
    estibasCompletadas: { A: 0, B: 0 },
    desbordes: 0,
    pesoDespachadoKg: { A: 0, B: 0, total: 0 },
    porTipo: { express: 0, fragil: 0, estandar: 0, pesado: 0, noread: 0 },
  };
  ultimoEscaneo = null;
  #siguienteId = 1;
  #indiceSecuencia = 0;
  #senalEstiba = { A: false, B: false };

  hayEspacioParaGenerar() {
    return this.paquetes.every((p) => p.caida || p.colocacion || p.s >= DISTANCIA_MINIMA);
  }

  get enTransporte() {
    return this.paquetes.filter((p) => !p.caida && !p.colocacion).length;
  }

  get enColaEntrada() {
    return this.paquetes.filter((p) => !p.caida && !p.colocacion && p.s <= S_STOPPER + 0.02).length;
  }

  fijarCriterioSorting(criterio, umbralKg = this.umbralPesoKg) {
    if (criterio === 'peso' || criterio === 'prioridad') this.criterioSorting = criterio;
    if (typeof umbralKg === 'number' && !Number.isNaN(umbralKg)) {
      this.umbralPesoKg = Math.min(25, Math.max(2, umbralKg));
    }
    return { criterio: this.criterioSorting, umbralPesoKg: this.umbralPesoKg };
  }

  // Calcula qué SKU (1=Ruta A, 2=Ruta B, 99=NO_READ) corresponde a un paquete según la regla de sorting activa
  skuDePaquete(paquete) {
    if (paquete.idTipo === 'noread' || paquete.skuForzado === 99) return 99;
    if (paquete.skuForzado === 1 || paquete.skuForzado === 2) return paquete.skuForzado;
    if (this.criterioSorting === 'peso') {
      return paquete.pesoKg < this.umbralPesoKg ? 1 : 2;
    }
    return TIPOS_PAQUETE[paquete.idTipo]?.skuPrioridad ?? 1;
  }

  programarNoRead(activo = true) {
    this.proximoNoRead = Boolean(activo);
  }

  fijarAtasco(activo) {
    this.atascoActivo = Boolean(activo);
    if (!this.atascoActivo) {
      for (const p of this.paquetes) p.atascado = false;
    }
    return this.atascoActivo;
  }

  generarPaquete(opciones = {}) {
    if (!this.hayEspacioParaGenerar()) return null;
    const id = this.#siguienteId++;

    let idTipo = opciones.tipo;
    let skuForzado = opciones.sku;

    if (!idTipo) {
      if (skuForzado === 99 || this.proximoNoRead) {
        idTipo = 'noread';
        this.proximoNoRead = false;
      } else if (skuForzado === 1) {
        idTipo = 'express';
      } else if (skuForzado === 2) {
        idTipo = 'estandar';
      } else {
        idTipo = SECUENCIA_TIPOS_AUTO[this.#indiceSecuencia % SECUENCIA_TIPOS_AUTO.length];
        this.#indiceSecuencia += 1;
      }
    }

    const defTipo = TIPOS_PAQUETE[idTipo] ?? TIPOS_PAQUETE.estandar;
    const paquete = {
      id,
      s: 0,
      rama: null,
      idTipo: defTipo.idTipo,
      nombreTipo: defTipo.nombre,
      pesoKg: defTipo.pesoKg,
      dimensiones: defTipo.dimensiones,
      skuForzado,
      sku: 1,
      codigoBarras: '',
      etiqueta: `${defTipo.etiquetaCorta} · ${defTipo.pesoKg}kg`,
      escaneado: false,
      atascado: false,
      destinoEsperado: null,
      malClasificado: false,
      caida: null,
      colocacion: null,
    };
    paquete.sku = this.skuDePaquete(paquete);
    paquete.codigoBarras = paquete.sku === 99
      ? `ERR-${String(id).padStart(3, '0')}`
      : `${defTipo.etiquetaCorta.slice(0, 3)}-${String(id).padStart(3, '0')}`;

    this.#colocar(paquete);
    this.paquetes.push(paquete);
    this.contadores.generados += 1;
    if (paquete.idTipo in this.contadores.porTipo) {
      this.contadores.porTipo[paquete.idTipo] += 1;
    }
    return paquete;
  }

  estibaNoDisponible(rama) {
    return this.estibas[rama].estado !== 'disponible';
  }

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

  // Apila de inmediato hasta un nivel completo (16 cajas, 4×4) en la estiba indicada
  // para poder demostrar rápidamente el llenado de 4 niveles (64 cajas) sin esperar 4 minutos.
  apilarNivelEstiba(rama, cantidad = POSICIONES_POR_CAPA) {
    const estiba = this.estibas[rama];
    if (!estiba || estiba.estado !== 'disponible') return 0;
    const tiposRama = rama === 'A' ? ['express', 'fragil'] : ['estandar', 'pesado'];
    let agregados = 0;
    while (agregados < cantidad && estiba.paquetes.length + estiba.enCamino < estiba.capacidad) {
      const indice = estiba.paquetes.length + estiba.enCamino;
      const id = this.#siguienteId++;
      const idTipo = tiposRama[indice % tiposRama.length];
      const defTipo = TIPOS_PAQUETE[idTipo];
      const sku = rama === 'B' ? 2 : 1;
      estiba.paquetes.push({
        id,
        posicion: posicionEnEstiba(rama, indice),
        rumbo: ESTIBAS[rama].rumbo,
        malClasificado: false,
        idTipo: defTipo.idTipo,
        pesoKg: defTipo.pesoKg,
        dimensiones: defTipo.dimensiones,
        sku,
        etiqueta: `${defTipo.etiquetaCorta} · ${defTipo.pesoKg}kg`,
      });
      this.contadores.generados += 1;
      this.contadores[rama] += 1;
      this.contadores.porTipo[idTipo] += 1;
      this.contadores.pesoDespachadoKg[rama] = Math.round((this.contadores.pesoDespachadoKg[rama] + defTipo.pesoKg) * 10) / 10;
      this.contadores.pesoDespachadoKg.total = Math.round((this.contadores.pesoDespachadoKg.total + defTipo.pesoKg) * 10) / 10;
      agregados += 1;
    }
    if (estiba.paquetes.length >= estiba.capacidad) estiba.estado = 'llena';
    return agregados;
  }

  poseEstiba(rama) {
    const { centro, direccion, entrada } = ESTIBAS[rama];
    const cambio = this.estibas[rama].cambio;
    if (!cambio) return centro.clone();
    const mitad = G.tiempoCambioEstiba / 2;
    if (cambio.t < mitad) return centro.clone().addScaledVector(direccion, suavizar(cambio.t / mitad) * RECORRIDO_CAMBIO);
    return centro.clone().addScaledVector(entrada, (1 - suavizar(Math.min((cambio.t - mitad) / mitad, 1))) * RECORRIDO_CAMBIO);
  }

  paso(dt, salidas, paletaEnB, selectorB, contextoPlc = null) {
    const eventos = {
      sensor: undefined,
      sensoresSalida: {},
      escaneo: null,
      despachados: [],
      depositados: [],
      estibas: [],
      retiradas: [],
    };
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

    for (const paquete of enHaz) {
      if (!paquete.escaneado) {
        paquete.escaneado = true;
        paquete.sku = this.skuDePaquete(paquete);
        const infoEscaneo = {
          id: paquete.id,
          idTipo: paquete.idTipo,
          nombreTipo: paquete.nombreTipo,
          pesoKg: paquete.pesoKg,
          sku: paquete.sku,
          codigoBarras: paquete.codigoBarras,
          etiqueta: paquete.etiqueta,
          criterio: this.criterioSorting,
          umbralPesoKg: this.umbralPesoKg,
        };
        this.ultimoEscaneo = infoEscaneo;
        eventos.escaneo = infoEscaneo;
      }
      if (paquete.destinoEsperado === null) {
        const modoRuteo = contextoPlc?.modoRuteo ?? 0;
        if (modoRuteo === 1) {
          if (paquete.sku === 1) paquete.destinoEsperado = 'A';
          else if (paquete.sku === 2) paquete.destinoEsperado = 'B';
        } else if (modoRuteo === 2) {
          paquete.destinoEsperado = null;
        } else {
          paquete.destinoEsperado = selectorB ? 'B' : 'A';
        }
      }
    }

    for (const paquete of this.paquetes) {
      if (!paquete.caida && !paquete.colocacion && paquete.destinoEsperado === null && paquete.s > S_SENSOR + 0.05) {
        paquete.destinoEsperado = salidas?.desviadorActivo ? 'B' : 'A';
      }
    }

    for (const rama of ['A', 'B']) {
      const sHaz = S_SENSOR_SALIDA[rama];
      const medio = G.paquete.largo / 2;
      const ocupadoSalida = this.paquetes.some(
        (p) => !p.caida && !p.colocacion && p.rama === rama && Math.abs(p.s - sHaz) <= medio,
      );
      if (ocupadoSalida !== this.sensoresSalidaOcupados[rama]) {
        this.sensoresSalidaOcupados[rama] = ocupadoSalida;
        eventos.sensoresSalida[rama] = ocupadoSalida;
      }
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
      let velocidad = salidas[MOTOR_DE_CINTA[cinta]] ? G.vCinta : 0;

      if (this.atascoActivo && paquete.s >= S_DECISION + 0.25 && (!paquete.rama || paquete.s < S_SENSOR_SALIDA[paquete.rama] - 0.2)) {
        paquete.atascado = true;
        velocidad = 0;
      } else {
        paquete.atascado = false;
      }

      let destino = paquete.s + velocidad * dt;

      if (salidas.frenoAdmision && paquete.s <= S_STOPPER + 1e-4) {
        destino = Math.min(destino, S_STOPPER);
      }

      for (const delante of delanteros) {
        if (compartenCarril(paquete, delante)) destino = Math.min(destino, delante.s - DISTANCIA_MINIMA);
      }
      paquete.s = Math.max(paquete.s, destino);

      if (paquete.rama === null && paquete.s >= S_DECISION) paquete.rama = paletaEnB >= 0.5 ? 'B' : 'A';

      if (paquete.rama && paquete.s >= S_FIN[paquete.rama]) this.#despachar(paquete, eventos);
      else this.#colocar(paquete);
      delanteros.push(paquete);
    }
  }

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
      const peso = paquete.pesoKg ?? 10;
      this.contadores.pesoDespachadoKg[paquete.rama] = Math.round((this.contadores.pesoDespachadoKg[paquete.rama] + peso) * 10) / 10;
      this.contadores.pesoDespachadoKg.total = Math.round((this.contadores.pesoDespachadoKg.total + peso) * 10) / 10;
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

  #animarColocaciones(dt, eventos) {
    for (const paquete of this.paquetes) {
      if (!paquete.colocacion) continue;
      const c = paquete.colocacion;
      c.t = Math.min(c.t + dt, G.tiempoColocacion);
      const u = suavizar(c.t / G.tiempoColocacion);
      paquete.posicion.lerpVectors(c.origen, c.destino, u);
      paquete.posicion.y += 4 * ALTURA_ARCO * u * (1 - u);
      if (c.t >= G.tiempoColocacion) {
        const estiba = this.estibas[paquete.rama];
        estiba.enCamino -= 1;
        estiba.paquetes.push({
          id: paquete.id,
          posicion: c.destino,
          rumbo: paquete.rumbo,
          malClasificado: paquete.malClasificado,
          idTipo: paquete.idTipo,
          pesoKg: paquete.pesoKg,
          dimensiones: paquete.dimensiones,
          sku: paquete.sku,
          etiqueta: paquete.etiqueta,
        });
        eventos.depositados.push({ id: paquete.id, rama: paquete.rama, posicion: c.indice, estiba: estiba.numero });
        if (estiba.paquetes.length >= estiba.capacidad) estiba.estado = 'llena';
      }
    }
    this.paquetes = this.paquetes.filter((p) => !p.colocacion || p.colocacion.t < G.tiempoColocacion);
  }

  #animarCambios(dt, eventos) {
    for (const [rama, estiba] of Object.entries(this.estibas)) {
      if (!estiba.cambio) continue;
      const mitad = G.tiempoCambioEstiba / 2;
      const antes = estiba.cambio.t;
      estiba.cambio.t += dt;
      if (antes < mitad && estiba.cambio.t >= mitad) {
        if (estiba.cambio.completa) this.contadores.estibasCompletadas[rama] += 1;
        eventos.retiradas.push({ rama, numero: estiba.numero, unidades: estiba.cambio.unidades, completa: estiba.cambio.completa });
        estiba.paquetes = [];
        estiba.numero += 1;
        estiba.capacidad = this.capacidadSiguiente;
      }
      if (estiba.cambio.t >= G.tiempoCambioEstiba) {
        estiba.cambio = null;
        estiba.estado = 'disponible';
      }
    }
  }

  #animarCaidas(dt) {
    const suelo = G.paquete.alto / 2;
    for (const paquete of this.paquetes) {
      if (!paquete.caida) continue;
      paquete.caida.t += dt;
      const t = paquete.caida.t;
      paquete.posicion.y = Math.max(suelo, paquete.caida.origen.y - 0.5 * GRAVEDAD * t * t);
    }
    this.paquetes = this.paquetes.filter((p) => !p.caida || p.caida.t < DURACION_CAIDA);
  }

  #colocar(paquete) {
    const { posicion, rumbo } = ubicar(paquete.rama, paquete.s);
    const altoCaja = paquete.dimensiones?.alto ?? G.paquete.alto;
    paquete.posicion = posicion.setY(G.alturaTransporte + altoCaja / 2);
    paquete.rumbo = rumbo;
  }
}
