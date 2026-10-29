// Componente 3D Paramétrico: Actuador Neumático y Mecanismo Desviador Industrial
// Cilindro neumático ISO 15552 con vástago cromado, racores rápidos,
// mangueras de poliuretano azul, sensores magnéticos de fin de carrera
// y paleta deflectora con perfil de absorción de impacto.
import * as THREE from 'three';

export const MATERIALES_DESVIADOR = {
  camisaAluminio: new THREE.MeshStandardMaterial({
    color: 0xa8b2bc,      // Aluminio anodizado natural del cilindro
    metalness: 0.7,
    roughness: 0.3,
  }),
  culata: new THREE.MeshStandardMaterial({
    color: 0x546170,      // Fundición oscura para culatas delantera y trasera
    metalness: 0.55,
    roughness: 0.45,
  }),
  vastagoCromado: new THREE.MeshStandardMaterial({
    color: 0xf0f3f6,      // Acero al cromo duro espejo (AISI 1045)
    metalness: 0.95,
    roughness: 0.1,
  }),
  racorMetalico: new THREE.MeshStandardMaterial({
    color: 0xd0d7de,      // Latón niquelado para racor Push-in
    metalness: 0.85,
    roughness: 0.25,
  }),
  mangueraNeumatica: new THREE.MeshStandardMaterial({
    color: 0x0284c7,      // Azul industrial poliuretano FESTO
    metalness: 0.1,
    roughness: 0.5,
  }),
  paletaAmarilla: new THREE.MeshStandardMaterial({
    color: 0xeab308,      // Amarillo de seguridad RAL 1021
    metalness: 0.3,
    roughness: 0.4,
  }),
  bordeGoma: new THREE.MeshStandardMaterial({
    color: 0x18181b,      // Goma de protección contra impactos (UHMW-PE)
    metalness: 0.1,
    roughness: 0.9,
  }),
  sensorReed: new THREE.MeshStandardMaterial({
    color: 0x27272a,      // Sensor magnético de proximidad para fin de carrera
    metalness: 0.2,
    roughness: 0.6,
  }),
};

/**
 * Crea el cilindro neumático completo con vástago móvil, racores y mangueras.
 */
export function crearCilindroNeumatico() {
  const grupo = new THREE.Group();
  grupo.name = 'cilindro-neumatico-iso';

  const M = MATERIALES_DESVIADOR;

  const largoCamisa = 0.16;
  const anchoCulata = 0.042;
  const largoCulata = 0.022;

  // 1. Camisa de perfil del cilindro
  const camisa = new THREE.Mesh(
    new THREE.BoxGeometry(largoCamisa, anchoCulata * 0.92, anchoCulata * 0.92),
    M.camisaAluminio
  );
  camisa.castShadow = true;
  grupo.add(camisa);

  // 2. Culata trasera con horquilla de anclaje
  const culataTrasera = new THREE.Mesh(
    new THREE.BoxGeometry(largoCulata, anchoCulata, anchoCulata),
    M.culata
  );
  culataTrasera.position.x = -(largoCamisa / 2 + largoCulata / 2);
  culataTrasera.castShadow = true;
  grupo.add(culataTrasera);

  // Horquilla trasera de pivote
  const horquilla = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.044, 12),
    M.culata
  );
  horquilla.rotation.z = Math.PI / 2;
  horquilla.position.x = -(largoCamisa / 2 + largoCulata + 0.012);
  grupo.add(horquilla);

  // 3. Culata delantera con casquillo guía de bronce
  const culataDelantera = new THREE.Mesh(
    new THREE.BoxGeometry(largoCulata, anchoCulata, anchoCulata),
    M.culata
  );
  culataDelantera.position.x = largoCamisa / 2 + largoCulata / 2;
  culataDelantera.castShadow = true;
  grupo.add(culataDelantera);

  // 4. Vástago cromado móvil
  const radioVastago = 0.009;
  const largoVastago = 0.14;
  const vastago = new THREE.Mesh(
    new THREE.CylinderGeometry(radioVastago, radioVastago, largoVastago, 16),
    M.vastagoCromado
  );
  vastago.rotation.z = -Math.PI / 2;
  vastago.position.x = largoCamisa / 2 + largoCulata + largoVastago / 2;
  vastago.castShadow = true;
  grupo.add(vastago);

  // Rótula de articulación en punta del vástago
  const rotula = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 12, 8),
    M.racorMetalico
  );
  rotula.position.x = largoCamisa / 2 + largoCulata + largoVastago;
  grupo.add(rotula);

  // 5. Racores neumáticos rápidos acodados (en ambas culatas)
  for (const xPos of [culataTrasera.position.x, culataDelantera.position.x]) {
    const racor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.014, 10),
      M.racorMetalico
    );
    racor.position.set(xPos, anchoCulata / 2 + 0.007, 0);
    grupo.add(racor);

    // Tramo de manguera azul flexible
    const manguera = new THREE.Mesh(
      new THREE.TorusGeometry(0.025, 0.004, 8, 16, Math.PI / 1.5),
      M.mangueraNeumatica
    );
    manguera.rotation.x = Math.PI / 2;
    manguera.position.set(xPos, anchoCulata / 2 + 0.02, 0.015);
    grupo.add(manguera);
  }

  // 6. Sensores magnéticos fin de carrera (Reed switches)
  for (const xOff of [-0.04, 0.04]) {
    const sensor = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.008, 0.01),
      M.sensorReed
    );
    sensor.position.set(xOff, 0, anchoCulata / 2 + 0.004);
    grupo.add(sensor);
  }

  return { grupo, vastago };
}

/**
 * Crea la paleta deflectora de desvío reforzada con franja de absorción de impacto.
 */
export function crearPaletaDeflectora({ largo = 0.75, alto = 0.12, espesor = 0.022 }) {
  const grupo = new THREE.Group();
  grupo.name = 'paleta-deflectora-industrial';

  const M = MATERIALES_DESVIADOR;

  // 1. Cuerpo estructural principal en amarillo seguridad
  const pala = new THREE.Mesh(
    new THREE.BoxGeometry(largo, alto, espesor),
    M.paletaAmarilla
  );
  pala.castShadow = true;
  pala.receiveShadow = true;
  grupo.add(pala);

  // 2. Franja protectora continua de goma UHMW-PE en la cara de contacto
  const franjaGoma = new THREE.Mesh(
    new THREE.BoxGeometry(largo * 0.98, alto * 0.75, 0.006),
    M.bordeGoma
  );
  franjaGoma.position.set(0, 0, espesor / 2 + 0.003);
  franjaGoma.castShadow = true;
  grupo.add(franjaGoma);

  // 3. Nervaduras de refuerzo mecánicas en la parte trasera
  const numNervios = 4;
  for (let i = 0; i < numNervios; i++) {
    const x = -largo / 2 + 0.1 + (i * (largo - 0.2)) / (numNervios - 1);
    const nervio = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, alto * 0.8, 0.018),
      M.culata
    );
    nervio.position.set(x, 0, -(espesor / 2 + 0.009));
    nervio.castShadow = true;
    grupo.add(nervio);
  }

  return grupo;
}
