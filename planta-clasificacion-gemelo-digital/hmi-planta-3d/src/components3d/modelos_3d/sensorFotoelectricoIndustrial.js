// Componente 3D Paramétrico: Puesto de Detección Óptica Industrial
// Fotocelda réflex IP67 con soporte micrométrico ranurado, conector M12,
// indicadores LED duales y catadióptrico prismático reflectivo.
import * as THREE from 'three';

export const MATERIALES_SENSOR = {
  carcasaSensor: new THREE.MeshStandardMaterial({
    color: 0x1f2428,      // Termoplástico técnico PBT negro mate
    metalness: 0.2,
    roughness: 0.6,
  }),
  lenteOptica: new THREE.MeshStandardMaterial({
    color: 0x111827,      // Vidrio oscuro filtrante infrarrojo
    metalness: 0.9,
    roughness: 0.1,
  }),
  soporteInox: new THREE.MeshStandardMaterial({
    color: 0xc8d1d9,      // Escuadra de acero inox plegada y ranurada
    metalness: 0.8,
    roughness: 0.25,
  }),
  conectorM12: new THREE.MeshStandardMaterial({
    color: 0xa0aec0,      // Latón niquelado moleteado M12
    metalness: 0.9,
    roughness: 0.2,
  }),
  cableNegro: new THREE.MeshStandardMaterial({
    color: 0x181a1b,      // Manguera de cable PUR apantallado
    metalness: 0.1,
    roughness: 0.8,
  }),
  reflectorPrisma: new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,      // Microprismas catadióptricos de alta reflectancia
    metalness: 0.3,
    roughness: 0.1,
  }),
  marcoReflector: new THREE.MeshStandardMaterial({
    color: 0xd97706,      // Marco naranja de seguridad del reflector
    metalness: 0.2,
    roughness: 0.5,
  }),
};

/**
 * Crea el cabezal del sensor fotoeléctrico con conector M12 y soporte ajustable.
 */
export function crearSensorIndustrial() {
  const grupo = new THREE.Group();
  grupo.name = 'sensor-fotoelectrico-industrial';

  const M = MATERIALES_SENSOR;

  const ancho = 0.024;
  const alto = 0.054;
  const fondo = 0.038;

  // 1. Carcasa principal compacta
  const cuerpo = new THREE.Mesh(
    new THREE.BoxGeometry(ancho, alto, fondo),
    M.carcasaSensor
  );
  cuerpo.castShadow = true;
  grupo.add(cuerpo);

  // Lente frontal óptica dual (Emisor + Receptor)
  const lente = new THREE.Mesh(
    new THREE.BoxGeometry(ancho * 0.85, alto * 0.45, 0.004),
    M.lenteOptica
  );
  lente.position.set(0, alto * 0.15, fondo / 2 + 0.002);
  grupo.add(lente);

  // 2. LEDs de estado en la parte superior
  // LED naranja: detección de paquete / conmutación de salida %IX0.3
  const matLedNaranja = new THREE.MeshStandardMaterial({
    color: 0x3d2800,
    emissive: 0x000000,
    roughness: 0.2,
  });
  const ledNaranja = new THREE.Mesh(
    new THREE.BoxGeometry(0.006, 0.004, 0.006),
    matLedNaranja
  );
  ledNaranja.position.set(-0.005, alto / 2 + 0.002, -0.008);
  grupo.add(ledNaranja);

  // LED verde: alimentación y estabilidad de señal óptica
  const ledVerde = new THREE.Mesh(
    new THREE.BoxGeometry(0.006, 0.004, 0.006),
    new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 1.5 })
  );
  ledVerde.position.set(0.005, alto / 2 + 0.002, -0.008);
  grupo.add(ledVerde);

  // Potenciómetro de ajuste multiturno
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.003, 10),
    M.conectorM12
  );
  pot.position.set(0, alto / 2 + 0.0015, 0.008);
  grupo.add(pot);

  // 3. Conector rápido M12 inferior y cable hacia canaleta
  const conector = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.007, 0.018, 12),
    M.conectorM12
  );
  conector.position.set(0, -(alto / 2 + 0.009), 0);
  grupo.add(conector);

  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.18, 8),
    M.cableNegro
  );
  cable.position.set(0, -(alto / 2 + 0.018 + 0.09), 0);
  grupo.add(cable);

  // 4. Escuadra de fijación ranurada en acero inox
  const soporte = new THREE.Mesh(
    new THREE.BoxGeometry(0.004, 0.09, 0.05),
    M.soporteInox
  );
  soporte.position.set(ancho / 2 + 0.003, -0.01, 0);
  soporte.castShadow = true;
  grupo.add(soporte);

  return {
    grupo,
    setDeteccion(activa) {
      if (activa) {
        matLedNaranja.color.set(0xf59e0b);
        matLedNaranja.emissive.set(0xf59e0b);
        matLedNaranja.emissiveIntensity = 2.0;
      } else {
        matLedNaranja.color.set(0x3d2800);
        matLedNaranja.emissive.set(0x000000);
        matLedNaranja.emissiveIntensity = 0;
      }
    },
  };
}

/**
 * Crea el espejo catadióptrico de retorno con marco de seguridad.
 */
export function crearReflectorCatadioptrico() {
  const grupo = new THREE.Group();
  grupo.name = 'reflector-catadioptrico';

  const M = MATERIALES_SENSOR;
  const ancho = 0.045;
  const alto = 0.06;
  const espesor = 0.008;

  // Marco de soporte
  const marco = new THREE.Mesh(
    new THREE.BoxGeometry(ancho, alto, espesor),
    M.marcoReflector
  );
  marco.castShadow = true;
  grupo.add(marco);

  // Superficie prismática reflectiva
  const prisma = new THREE.Mesh(
    new THREE.BoxGeometry(ancho * 0.85, alto * 0.85, 0.003),
    M.reflectorPrisma
  );
  prisma.position.z = espesor / 2 + 0.001;
  grupo.add(prisma);

  // Soporte de varilla de montaje
  const varilla = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.14, 10),
    M.soporteInox
  );
  varilla.position.y = -(alto / 2 + 0.07);
  grupo.add(varilla);

  return grupo;
}
