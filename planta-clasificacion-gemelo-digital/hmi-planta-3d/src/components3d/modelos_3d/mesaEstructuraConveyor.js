// Componente 3D Paramétrico: Estructura, Bastidor y Mesas Conveyor
// Perfilería tipo Bosch Rexroth 45x45 con ranuras en T, patas autonivelantes
// articuladas, guías laterales inox, escuadras de rigidización y chumaceras.
import * as THREE from 'three';

export const MATERIALES_ESTRUCTURA = {
  perfilAluminio: new THREE.MeshStandardMaterial({
    color: 0x98a3af,       // Aluminio anodizado satinado
    metalness: 0.65,
    roughness: 0.35,
  }),
  ranuraT: new THREE.MeshStandardMaterial({
    color: 0x5a636e,       // Fondo oscuro de la ranura en T
    metalness: 0.4,
    roughness: 0.7,
  }),
  escuadra: new THREE.MeshStandardMaterial({
    color: 0x7c8793,       // Fundición de aluminio para escuadras de fijación
    metalness: 0.5,
    roughness: 0.45,
  }),
  aceroZincado: new THREE.MeshStandardMaterial({
    color: 0xdde2e6,       // Acero zincado brillante para pernos y espárragos
    metalness: 0.85,
    roughness: 0.2,
  }),
  baseGoma: new THREE.MeshStandardMaterial({
    color: 0x1a1d20,       // Elastómero/goma vulcanizada del pie autonivelante
    metalness: 0.1,
    roughness: 0.85,
  }),
  guiaInox: new THREE.MeshStandardMaterial({
    color: 0xe6ebf0,       // Acero inoxidable pulido AISI 304
    metalness: 0.9,
    roughness: 0.18,
  }),
  chumacera: new THREE.MeshStandardMaterial({
    color: 0x3d4b59,       // Fundición gris para soporte de rodamiento
    metalness: 0.6,
    roughness: 0.45,
  }),
};

/**
 * Crea una pata industrial con perfil de aluminio y pie autonivelante articulado.
 */
export function crearPataConveyor({ altura, grosor = 0.045 }) {
  const grupo = new THREE.Group();
  grupo.name = 'pata-industrial';

  const M = MATERIALES_ESTRUCTURA;

  // 1. Perfil principal de aluminio (45x45 mm)
  const perfil = new THREE.Mesh(
    new THREE.BoxGeometry(grosor, altura - 0.04, grosor),
    M.perfilAluminio
  );
  perfil.position.y = (altura - 0.04) / 2 + 0.035;
  perfil.castShadow = true;
  perfil.receiveShadow = true;
  grupo.add(perfil);

  // Detalle de ranuras en T en las caras exteriores
  const anchoRanura = 0.009;
  const profRanura = 0.003;
  for (const rot of [0, Math.PI / 2]) {
    const tiraRanura = new THREE.Mesh(
      new THREE.BoxGeometry(grosor + profRanura * 2, altura - 0.06, anchoRanura),
      M.ranuraT
    );
    tiraRanura.rotation.y = rot;
    tiraRanura.position.y = perfil.position.y;
    grupo.add(tiraRanura);
  }

  // 2. Pie autonivelante articulado con placa de goma
  const diametroBase = 0.065;
  const espesorBase = 0.012;
  const pieBase = new THREE.Mesh(
    new THREE.CylinderGeometry(diametroBase * 0.45, diametroBase * 0.5, espesorBase, 20),
    M.baseGoma
  );
  pieBase.position.y = espesorBase / 2;
  pieBase.receiveShadow = true;
  grupo.add(pieBase);

  // Casquete metálico sobre el pie
  const casquete = new THREE.Mesh(
    new THREE.CylinderGeometry(diametroBase * 0.35, diametroBase * 0.45, 0.008, 20),
    M.aceroZincado
  );
  casquete.position.y = espesorBase + 0.004;
  casquete.castShadow = true;
  grupo.add(casquete);

  // Espárrago roscado de elevación M16
  const esparrago = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.035, 12),
    M.aceroZincado
  );
  esparrago.position.y = 0.024;
  grupo.add(esparrago);

  // Tuerca hexagonal de bloqueo
  const tuerca = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.009, 6),
    M.aceroZincado
  );
  tuerca.position.y = 0.032;
  grupo.add(tuerca);

  // 3. Escuadra de unión superior (Gusset bracket)
  const escuadra = new THREE.Mesh(
    new THREE.BoxGeometry(grosor * 1.3, 0.035, grosor * 1.3),
    M.escuadra
  );
  escuadra.position.y = altura + 0.01;
  escuadra.castShadow = true;
  grupo.add(escuadra);

  return grupo;
}

/**
 * Crea una chumacera embridada (flanged bearing) con pernos y grasera para extremos de rodillos.
 */
export function crearChumacera({ radio = 0.032 } = {}) {
  const grupo = new THREE.Group();
  grupo.name = 'chumacera-rodamiento';

  const M = MATERIALES_ESTRUCTURA;

  // Cuerpo de fundición romboidal / circular
  const cuerpo = new THREE.Mesh(
    new THREE.CylinderGeometry(radio * 0.9, radio, 0.018, 16),
    M.chumacera
  );
  cuerpo.rotation.x = Math.PI / 2;
  cuerpo.castShadow = true;
  grupo.add(cuerpo);

  // Rodamiento de bolas central
  const pista = new THREE.Mesh(
    new THREE.CylinderGeometry(radio * 0.5, radio * 0.5, 0.022, 16),
    M.aceroZincado
  );
  pista.rotation.x = Math.PI / 2;
  grupo.add(pista);

  // Grasera de lubricación superior
  const grasera = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.004, 0.009, 8),
    M.aceroZincado
  );
  grasera.position.set(0, radio * 0.85, 0);
  grupo.add(grasera);

  return grupo;
}

/**
 * Crea guías laterales regulables de acero inoxidable para mantener los paquetes centrados.
 */
export function crearGuiasLaterales({ largo, anchoTransporte, alturaTransporte, lados = [-1, 1] }) {
  const grupo = new THREE.Group();
  grupo.name = 'guias-laterales-inox';

  const M = MATERIALES_ESTRUCTURA;
  const altoGuia = 0.038;
  const espesorGuia = 0.006;
  const cotaGuia = alturaTransporte + altoGuia / 2 + 0.015;

  for (const lado of lados) {
    const zOffset = lado * (anchoTransporte / 2 + 0.012);

    // Barra o perfil continuo de acero inoxidable
    const barra = new THREE.Mesh(
      new THREE.BoxGeometry(largo * 0.98, altoGuia, espesorGuia),
      M.guiaInox
    );
    barra.position.set(0, cotaGuia, zOffset);
    barra.castShadow = true;
    grupo.add(barra);

    // Soportes de clamp regulables cada ≈ 0.6 m
    const numSoportes = Math.max(2, Math.ceil(largo / 0.65) + 1);
    for (let i = 0; i < numSoportes; i++) {
      const x = -largo / 2 + 0.06 + (i * (largo - 0.12)) / (numSoportes - 1);
      
      // Brazo vertical de sujeción
      const posteSoporte = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.09, 10),
        M.aceroZincado
      );
      posteSoporte.position.set(x, cotaGuia - 0.03, zOffset + lado * 0.015);
      posteSoporte.castShadow = true;
      grupo.add(posteSoporte);

      // Clamp de ajuste horizontal
      const clamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.018, 0.024),
        M.escuadra
      );
      clamp.position.set(x, cotaGuia, zOffset + lado * 0.012);
      grupo.add(clamp);
    }
  }

  return grupo;
}
