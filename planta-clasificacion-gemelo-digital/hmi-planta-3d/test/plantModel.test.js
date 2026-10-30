// Pruebas del modelo cinemático: geometría frente a T_clas, movimiento según
// las salidas del PLC, sensor por AABB, fotoceldas de salida, stopper indexador,
// escáner óptico SKU, atascos inducidos y estibas de salida.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTIBAS, GEOMETRIA, ModeloPlanta, S_DECISION, S_SENSOR, S_STOPPER,
  TIPOS_PAQUETE, posicionEnEstiba, tiempoDespeje,
} from '../src/core/plantModel.js';

const DT = 1 / 60;
const APAGADAS = { cintaEntrada: false, desviadorActivo: false, cintaSalidaA: false, cintaSalidaB: false, balizaAlarma: false };
const ESPERANDO = { ...APAGADAS, cintaEntrada: true };
const RUTA_A = { ...ESPERANDO, cintaSalidaA: true };
const RUTA_B = { ...ESPERANDO, desviadorActivo: true, cintaSalidaB: true };

function simular(modelo, segundos, salidas, { paleta = 0, selectorB = false, contextoPlc = null } = {}) {
  const eventos = { sensor: [], sensoresSalidaA: [], sensoresSalidaB: [], escaneos: [], despachados: [], depositados: [], estibas: [], retiradas: [] };
  for (let t = 0; t < segundos; t += DT) {
    const e = modelo.paso(DT, salidas, paleta, selectorB, contextoPlc);
    if (e.sensor !== undefined) eventos.sensor.push(e.sensor);
    if (e.sensoresSalida?.A !== undefined) eventos.sensoresSalidaA.push(e.sensoresSalida.A);
    if (e.sensoresSalida?.B !== undefined) eventos.sensoresSalidaB.push(e.sensoresSalida.B);
    if (e.escaneo) eventos.escaneos.push(e.escaneo);
    for (const clave of ['despachados', 'depositados', 'estibas', 'retiradas']) eventos[clave].push(...e[clave]);
  }
  return eventos;
}

function clasificarUno(modelo, rama) {
  modelo.generarPaquete();
  return simular(modelo, 8.5, rama === 'B' ? RUTA_B : RUTA_A, { paleta: rama === 'B' ? 1 : 0, selectorB: rama === 'B' });
}

describe('Geometría de la Fase 4 frente al PLC', () => {
  test('cada paquete despeja la planta antes de T_clas, con margen para la latencia', () => {
    const MARGEN_LATENCIA = 0.1;
    for (const rama of ['A', 'B']) {
      const t = tiempoDespeje(rama);
      assert.ok(t + MARGEN_LATENCIA <= GEOMETRIA.tClasificacion,
        `ruta ${rama}: despeje ${t.toFixed(2)} s + ${MARGEN_LATENCIA} s > T_clas ${GEOMETRIA.tClasificacion} s`);
    }
  });
});

describe('Modelo cinemático', () => {
  test('el paquete solo avanza con el motor de su cinta energizado', () => {
    const modelo = new ModeloPlanta();
    const paquete = modelo.generarPaquete();
    simular(modelo, 1, APAGADAS);
    assert.equal(paquete.s, 0);
    simular(modelo, 1, ESPERANDO);
    assert.ok(Math.abs(paquete.s - GEOMETRIA.vCinta) < 0.02, `avanzó ${paquete.s.toFixed(3)} m en 1 s`);
  });

  test('sin PLC vivo (salidas = null) todo queda congelado', () => {
    const modelo = new ModeloPlanta();
    const paquete = modelo.generarPaquete();
    simular(modelo, 2, null);
    assert.equal(paquete.s, 0);
  });

  test('el sensor se activa al cortar el haz y se libera cuando el paquete lo deja', () => {
    const modelo = new ModeloPlanta();
    modelo.generarPaquete();
    const hastaHaz = (S_SENSOR - GEOMETRIA.paquete.largo / 2) / GEOMETRIA.vCinta;
    const antes = simular(modelo, hastaHaz - 0.05, ESPERANDO);
    assert.deepEqual(antes.sensor, []);
    const despues = simular(modelo, 1, RUTA_A, { selectorB: true });
    assert.deepEqual(despues.sensor, [true, false]);
    assert.equal(modelo.paquetes[0].destinoEsperado, 'B', 'el destino esperado se anota con el selector en el flanco');
  });

  test('con la paleta en B el paquete toma la ruta B y se despacha a tiempo', () => {
    const modelo = new ModeloPlanta();
    modelo.generarPaquete();
    simular(modelo, (S_SENSOR - GEOMETRIA.paquete.largo / 2) / GEOMETRIA.vCinta, ESPERANDO, { selectorB: true });
    const { despachados } = simular(modelo, GEOMETRIA.tClasificacion, RUTA_B, { paleta: 1, selectorB: true });
    assert.equal(despachados.length, 1);
    assert.deepEqual(despachados[0], { id: 1, rama: 'B', destinoEsperado: 'B', correcto: true, desbordado: false });
    assert.deepEqual([modelo.contadores.generados, modelo.contadores.A, modelo.contadores.B, modelo.contadores.malClasificados],
      [1, 0, 1, 0]);
  });

  test('si la paleta no llegó a B el paquete sigue recto y cuenta como mal clasificado', () => {
    const modelo = new ModeloPlanta();
    modelo.generarPaquete();
    const { despachados } = simular(modelo, 8, { ...ESPERANDO, cintaSalidaA: true }, { paleta: 0, selectorB: true });
    assert.equal(despachados[0].rama, 'A');
    assert.equal(despachados[0].correcto, false);
    assert.equal(modelo.contadores.malClasificados, 1);
  });

  test('un paquete no alcanza al de delante cuando este se detiene', () => {
    const modelo = new ModeloPlanta();
    const primero = modelo.generarPaquete();
    simular(modelo, 1, ESPERANDO);
    const segundo = modelo.generarPaquete();
    simular(modelo, 8, ESPERANDO);
    assert.ok(primero.s > S_DECISION, 'el primero cruzó la bifurcación');
    const hueco = primero.s - segundo.s;
    assert.ok(hueco >= GEOMETRIA.paquete.largo + GEOMETRIA.separacionMinima - 1e-9, `hueco de ${hueco.toFixed(3)} m`);
  });

  test('no se genera un paquete encima de otro', () => {
    const modelo = new ModeloPlanta();
    assert.ok(modelo.generarPaquete());
    assert.equal(modelo.generarPaquete(), null);
  });
});

describe('Instrumentación OT avanzada (v1.2.0): Fotoceldas de salida, Stopper, Escáner y Atascos', () => {
  test('las fotoceldas de salida A (%IX0.7) y B (%IX1.0) emiten flanco ascendente y descendente antes del despacho', () => {
    const modelo = new ModeloPlanta();
    modelo.generarPaquete({ sku: 2 });
    const ev = simular(modelo, 8, RUTA_B, { paleta: 1, selectorB: true });
    assert.deepEqual(ev.sensoresSalidaB, [true, false]);
    assert.deepEqual(ev.sensoresSalidaA, []);
    assert.equal(ev.escaneos.length, 1);
    assert.equal(ev.escaneos[0].sku, 2);
  });

  test('el tope indexador (%QX0.7 frenoAdmision) retiene la cola en S_STOPPER sin frenar al paquete que ya cruzó', () => {
    const modelo = new ModeloPlanta();
    const p1 = modelo.generarPaquete({ sku: 1 });
    simular(modelo, 1.2, ESPERANDO);
    const p2 = modelo.generarPaquete({ sku: 2 });
    // Avanzar hasta que p1 cruce S_STOPPER y el sensor de entrada
    const hastaSensor = (S_SENSOR - p1.s + 0.05) / GEOMETRIA.vCinta;
    simular(modelo, hastaSensor, ESPERANDO);
    assert.ok(p1.s > S_STOPPER, 'p1 ya superó el stopper');

    // Al activar frenoAdmision durante CLASIFICANDO_RUTA_A, p1 se despacha y p2 espera en S_STOPPER
    const ev = simular(modelo, 4.5, { ...RUTA_A, frenoAdmision: true });
    assert.equal(ev.despachados.length, 1);
    assert.equal(ev.despachados[0].id, p1.id);
    assert.ok(Math.abs(p2.s - S_STOPPER) < 1e-3, `p2 retenido en S_STOPPER (${p2.s.toFixed(3)} ≈ ${S_STOPPER.toFixed(3)})`);
    assert.equal(modelo.enColaEntrada, 1);
  });

  test('al inyectar un atasco físico en banda, el paquete se traba antes del sensor de salida', () => {
    const modelo = new ModeloPlanta();
    modelo.generarPaquete({ sku: 1 });
    modelo.fijarAtasco(true);
    const ev = simular(modelo, 8, RUTA_A);
    assert.equal(ev.despachados.length, 0, 'el paquete atascado no llega a despacharse');
    assert.equal(ev.sensoresSalidaA.length, 0, 'tampoco activa la fotocelda de salida A');
    assert.equal(modelo.paquetes[0].atascado, true);

    // Al despejar el atasco, continúa y se despacha
    modelo.fijarAtasco(false);
    const evDespues = simular(modelo, 4, RUTA_A);
    assert.equal(evDespues.despachados.length, 1);
  });
});

describe('Estibas de salida (Fase 5)', () => {
  test('el paquete despachado vuela a la primera posición de su estiba y queda depositado', () => {
    const modelo = new ModeloPlanta();
    const { depositados } = clasificarUno(modelo, 'B');
    assert.deepEqual(depositados.map(({ rama, posicion, estiba }) => ({ rama, posicion, estiba })), [{ rama: 'B', posicion: 0, estiba: 1 }]);
    assert.equal(modelo.estibas.B.paquetes.length, 1);
    assert.ok(modelo.estibas.B.paquetes[0].posicion.distanceTo(posicionEnEstiba('B', 0)) < 1e-9);
    assert.equal(modelo.enTransporte, 0);
  });

  test('las posiciones llenan una capa de 4 × 4 sin solaparse y apilan la siguiente capa encima', () => {
    const posiciones = Array.from({ length: 17 }, (_, i) => posicionEnEstiba('A', i));
    for (let i = 0; i < 16; i++) {
      for (let j = i + 1; j < 16; j++) assert.ok(posiciones[i].distanceTo(posiciones[j]) >= GEOMETRIA.paquete.ancho - 1e-9);
    }
    assert.ok(Math.abs(posiciones[16].y - posiciones[0].y - GEOMETRIA.paquete.alto) < 1e-9, 'la posición 16 abre la segunda capa');
  });

  test('al alcanzar la capacidad la estiba queda llena y emite la señal de no disponible', () => {
    const modelo = new ModeloPlanta();
    modelo.fijarCapacidad(2);
    clasificarUno(modelo, 'A');
    assert.equal(modelo.estibas.A.estado, 'disponible');
    const { estibas } = clasificarUno(modelo, 'A');
    assert.equal(modelo.estibas.A.estado, 'llena');
    assert.deepEqual(estibas, [{ rama: 'A', noDisponible: true }]);
  });

  test('cambiar la estiba: sale la llena, entra una vacía y la señal se libera al terminar', () => {
    const modelo = new ModeloPlanta();
    modelo.fijarCapacidad(1);
    clasificarUno(modelo, 'A');
    assert.ok(modelo.cambiarEstiba('A'));
    assert.equal(modelo.estibaNoDisponible('A'), true, 'durante el cambio sigue no disponible');
    const { retiradas, estibas } = simular(modelo, GEOMETRIA.tiempoCambioEstiba + 0.1, null);
    assert.deepEqual(retiradas, [{ rama: 'A', numero: 1, unidades: 1, completa: true }]);
    assert.deepEqual(estibas, [{ rama: 'A', noDisponible: false }]);
    assert.deepEqual([modelo.estibas.A.numero, modelo.estibas.A.paquetes.length], [2, 0]);
    assert.equal(modelo.contadores.estibasCompletadas.A, 1);
  });

  test('en el cambio, ninguna estiba atraviesa la otra', () => {
    const esquinas = (centro, { direccion, normal }) => [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => centro.clone()
      .addScaledVector(direccion, (a * GEOMETRIA.estiba.largo) / 2).addScaledVector(normal, (b * GEOMETRIA.estiba.ancho) / 2));
    const separadas = (p, q) => [ESTIBAS.A, ESTIBAS.B].flatMap((e) => [e.direccion, e.normal]).some((eje) => {
      const [minP, maxP, minQ, maxQ] = [p, q].flatMap((poligono) => {
        const proyecciones = poligono.map((v) => v.dot(eje));
        return [Math.min(...proyecciones), Math.max(...proyecciones)];
      });
      return maxP <= minQ || maxQ <= minP;
    });
    for (const [rama, otra] of [['A', 'B'], ['B', 'A']]) {
      const modelo = new ModeloPlanta();
      clasificarUno(modelo, rama);
      assert.ok(modelo.cambiarEstiba(rama));
      const fija = esquinas(ESTIBAS[otra].centro, ESTIBAS[otra]);
      for (let t = 0; t <= GEOMETRIA.tiempoCambioEstiba; t += 0.05) {
        modelo.estibas[rama].cambio.t = t;
        assert.ok(separadas(esquinas(modelo.poseEstiba(rama), ESTIBAS[rama]), fija), `estiba ${rama} sobre la ${otra} en t = ${t.toFixed(2)} s`);
      }
    }
  });

  test('un paquete hacia una estiba no disponible se desborda al suelo', () => {
    const modelo = new ModeloPlanta();
    modelo.fijarCapacidad(1);
    clasificarUno(modelo, 'A');
    const { despachados } = clasificarUno(modelo, 'A');
    assert.equal(modelo.contadores.desbordes, 1);
    assert.equal(modelo.estibas.A.paquetes.length, 1);
    assert.equal(despachados[0].desbordado, true, 'el evento avisa del desborde');
  });

  test('la capacidad nueva se aplica ya a una estiba vacía y a la siguiente si la actual tiene carga', () => {
    const modelo = new ModeloPlanta();
    assert.equal(modelo.estibas.A.capacidad, 64, 'por defecto 4 niveles completos (64 cajas)');
    assert.equal(modelo.fijarCapacidad(5), 5);
    assert.equal(modelo.estibas.A.capacidad, 5);
    clasificarUno(modelo, 'A');
    modelo.fijarCapacidad(999);
    assert.deepEqual([modelo.estibas.A.capacidad, modelo.capacidadSiguiente], [5, 96]);
  });

  test('la estiba apila 4 niveles completos (64 cajas = 4 × 16) antes de llenarse y solicitar cambio', () => {
    const modelo = new ModeloPlanta();
    assert.equal(modelo.estibas.A.capacidad, 64);
    for (let nivel = 1; nivel <= 3; nivel++) {
      assert.equal(modelo.apilarNivelEstiba('A'), 16);
      assert.equal(modelo.estibas.A.paquetes.length, nivel * 16);
      assert.equal(modelo.estibas.A.estado, 'disponible');
    }
    // Al completar el 4.º nivel (64 cajas), la estiba pasa a 'llena' y la 4.ª capa queda a 3*alto por encima de la 1.ª
    assert.equal(modelo.apilarNivelEstiba('A'), 16);
    assert.equal(modelo.estibas.A.paquetes.length, 64);
    assert.equal(modelo.estibas.A.estado, 'llena');
    const cotaNivel1 = modelo.estibas.A.paquetes[0].posicion.y;
    const cotaNivel4 = modelo.estibas.A.paquetes[48].posicion.y;
    assert.ok(Math.abs(cotaNivel4 - cotaNivel1 - 3 * GEOMETRIA.paquete.alto) < 1e-9);
  });

  test('el catálogo multiformato cambia la ruta SKU según el criterio de sorting (Prioridad vs Peso) y acumula kg', () => {
    const modelo = new ModeloPlanta();
    // En criterio 'prioridad' (por defecto): Frágil (6 kg) -> Estiba A (SKU 1); Estándar (11.5 kg) -> Estiba B (SKU 2)
    const pFragil = modelo.generarPaquete({ tipo: 'fragil' });
    assert.equal(pFragil.sku, 1);
    assert.equal(pFragil.pesoKg, 6.0);

    // Al cambiar a 'peso' con umbral 5 kg (< 5 kg -> A, >= 5 kg -> B): Frágil (6 kg) pasa a SKU 2 (Estiba B)
    modelo.fijarCriterioSorting('peso', 5);
    assert.equal(modelo.skuDePaquete(pFragil), 2);

    const ev = simular(modelo, 8, RUTA_B, { paleta: 1, selectorB: true });
    assert.equal(ev.escaneos[0].sku, 2);
    assert.equal(ev.escaneos[0].pesoKg, 6.0);
    assert.equal(modelo.contadores.pesoDespachadoKg.B, 6.0);
    assert.equal(modelo.contadores.porTipo.fragil, 1);
  });
});
