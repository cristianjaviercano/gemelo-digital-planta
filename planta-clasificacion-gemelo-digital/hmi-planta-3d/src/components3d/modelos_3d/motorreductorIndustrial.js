// Componente 3D Paramétrico: Motorreductor Industrial Trifásico IEC
// Con aletas de refrigeración, caja de bornes M20, reductor con brida,
// cubierta de ventilador trasera y eje con chavetero.
import * as THREE from 'three';

// Materiales PBR optimizados para maquinaria industrial
export const MATERIALES_MOTOR = {
  carcasa: new THREE.MeshStandardMaterial({
    color: 0x245a8a,      // Azul maquinaria industrial (RAL 5012)
    metalness: 0.45,
    roughness: 0.42,
  }),
  reductor: new THREE.MeshStandardMaterial({
    color: 0x1d476f,      // Azul fundición más oscuro para el reductor
    metalness: 0.55,
    roughness: 0.38,
  }),
  aceroMecanizado: new THREE.MeshStandardMaterial({
    color: 0xd8dde3,      // Acero brillante rectificado
    metalness: 0.85,
    roughness: 0.22,
  }),
  fundicionNegra: new THREE.MeshStandardMaterial({
    color: 0x22262a,      // Tapa de ventilador y juntas
    metalness: 0.3,
    roughness: 0.7,
  }),
  placaAluminio: new THREE.MeshStandardMaterial({
    color: 0xe8ecef,      // Placa de características técnicas
    metalness: 0.75,
    roughness: 0.28,
  }),
  aletas: new THREE.MeshStandardMaterial({
    color: 0x215482,
    metalness: 0.4,
    roughness: 0.45,
  }),
};

/**
 * Crea un motorreductor trifásico con alto nivel de detalle mecánico.
 * @param {Object} opciones
 * @param {number} opciones.escala - Factor de escala general (defecto 1)
 * @param {boolean} opciones.ejeLargo - Si el eje de salida debe ser extendido
 */
export function crearMotorreductor({ escala = 1, ejeLargo = false } = {}) {
  const grupo = new THREE.Group();
  grupo.name = 'motorreductor-industrial';

  const M = MATERIALES_MOTOR;

  // 1. Cuerpo principal del estator (Cilindro base)
  const radioEstator = 0.058 * escala;
  const largoEstator = 0.13 * escala;
  const estator = new THREE.Mesh(
    new THREE.CylinderGeometry(radioEstator, radioEstator, largoEstator, 24),
    M.carcasa
  );
  estator.rotation.x = Math.PI / 2;
  estator.castShadow = true;
  estator.receiveShadow = true;
  grupo.add(estator);

  // 2. Aletas de refrigeración perimetrales (fins)
  const numAletas = 12;
  const anchoAleta = 0.004 * escala;
  const grosorAleta = 0.012 * escala;
  for (let i = 0; i < numAletas; i++) {
    const angulo = (i / numAletas) * Math.PI * 2;
    // Omitir la parte superior para dejar espacio a la caja de bornes
    if (angulo > Math.PI * 0.35 && angulo < Math.PI * 0.65) continue;
    const aleta = new THREE.Mesh(
      new THREE.BoxGeometry(grosorAleta, largoEstator * 0.92, anchoAleta),
      M.aletas
    );
    aleta.position.set(
      Math.cos(angulo) * (radioEstator + grosorAleta / 2),
      Math.sin(angulo) * (radioEstator + grosorAleta / 2),
      0
    );
    aleta.rotation.z = angulo;
    aleta.castShadow = true;
    grupo.add(aleta);
  }

  // 3. Tapa trasera y rejilla del ventilador (Fan cowl)
  const radioTapa = radioEstator * 0.98;
  const largoTapa = 0.038 * escala;
  const tapaVentilador = new THREE.Mesh(
    new THREE.CylinderGeometry(radioTapa * 0.88, radioTapa, largoTapa, 20),
    M.fundicionNegra
  );
  tapaVentilador.rotation.x = Math.PI / 2;
  tapaVentilador.position.z = -(largoEstator / 2 + largoTapa / 2);
  tapaVentilador.castShadow = true;
  grupo.add(tapaVentilador);

  // Remaches / pernos en la rejilla del ventilador
  const domoCierre = new THREE.Mesh(
    new THREE.SphereGeometry(radioTapa * 0.4, 12, 8),
    M.fundicionNegra
  );
  domoCierre.position.z = -(largoEstator / 2 + largoTapa);
  grupo.add(domoCierre);

  // 4. Caja de bornes superior (Terminal Box)
  const anchoCaja = 0.048 * escala;
  const altoCaja = 0.038 * escala;
  const largoCaja = 0.065 * escala;
  const cajaBornes = new THREE.Mesh(
    new THREE.BoxGeometry(anchoCaja, altoCaja, largoCaja),
    M.carcasa
  );
  cajaBornes.position.set(0, radioEstator + altoCaja / 2, 0);
  cajaBornes.castShadow = true;
  grupo.add(cajaBornes);

  // Tapa superior con bisel y tornillos de fijación
  const tapaCaja = new THREE.Mesh(
    new THREE.BoxGeometry(anchoCaja * 1.08, 0.007 * escala, largoCaja * 1.08),
    M.fundicionNegra
  );
  tapaCaja.position.set(0, radioEstator + altoCaja + 0.0035 * escala, 0);
  grupo.add(tapaCaja);

  // Prensaestopas de cable M20 con salida de cable industrial
  const prensaestopas = new THREE.Mesh(
    new THREE.CylinderGeometry(0.009 * escala, 0.011 * escala, 0.018 * escala, 12),
    M.aceroMecanizado
  );
  prensaestopas.position.set(anchoCaja / 2 + 0.009 * escala, radioEstator + altoCaja * 0.5, 0);
  prensaestopas.rotation.z = Math.PI / 2;
  grupo.add(prensaestopas);

  // Cable corrugado negro flexible
  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006 * escala, 0.006 * escala, 0.04 * escala, 8),
    M.fundicionNegra
  );
  cable.position.set(anchoCaja / 2 + 0.028 * escala, radioEstator + altoCaja * 0.4, 0.01 * escala);
  cable.rotation.z = Math.PI / 3;
  grupo.add(cable);

  // Placa de características técnicas (Nameplate)
  const placa = new THREE.Mesh(
    new THREE.PlaneGeometry(0.032 * escala, 0.022 * escala),
    M.placaAluminio
  );
  placa.position.set(radioEstator + 0.002 * escala, radioEstator * 0.4, 0);
  placa.rotation.y = Math.PI / 2;
  grupo.add(placa);

  // 5. Caja reductora de engranajes acoplada (Gearbox)
  const anchoReductor = 0.1 * escala;
  const altoReductor = 0.11 * escala;
  const fondoReductor = 0.075 * escala;
  const cuerpoReductor = new THREE.Mesh(
    new THREE.BoxGeometry(anchoReductor, altoReductor, fondoReductor),
    M.reductor
  );
  cuerpoReductor.position.set(0, -0.01 * escala, largoEstator / 2 + fondoReductor / 2);
  cuerpoReductor.castShadow = true;
  grupo.add(cuerpoReductor);

  // Brida de fijación delantera B5 / B14
  const radioBrida = 0.065 * escala;
  const brida = new THREE.Mesh(
    new THREE.CylinderGeometry(radioBrida, radioBrida, 0.012 * escala, 20),
    M.aceroMecanizado
  );
  brida.rotation.x = Math.PI / 2;
  brida.position.z = largoEstator / 2 + fondoReductor + 0.006 * escala;
  brida.castShadow = true;
  grupo.add(brida);

  // 6. Eje motriz de salida con chavetero (Output drive shaft)
  const radioEje = 0.016 * escala;
  const largoEje = (ejeLargo ? 0.065 : 0.038) * escala;
  const ejeSalida = new THREE.Mesh(
    new THREE.CylinderGeometry(radioEje, radioEje, largoEje, 16),
    M.aceroMecanizado
  );
  ejeSalida.rotation.x = Math.PI / 2;
  ejeSalida.position.z = largoEstator / 2 + fondoReductor + 0.012 * escala + largoEje / 2;
  ejeSalida.castShadow = true;
  grupo.add(ejeSalida);

  // Chaveta de fijación mecánica sobre el eje
  const chaveta = new THREE.Mesh(
    new THREE.BoxGeometry(0.005 * escala, 0.006 * escala, largoEje * 0.75),
    M.aceroMecanizado
  );
  chaveta.position.set(0, radioEje, largoEstator / 2 + fondoReductor + 0.012 * escala + largoEje / 2);
  grupo.add(chaveta);

  // 7. Ojo de buey / nivel de aceite del reductor
  const ojoBuey = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007 * escala, 0.007 * escala, 0.004 * escala, 12),
    new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.9, roughness: 0.1 })
  );
  ojoBuey.rotation.z = Math.PI / 2;
  ojoBuey.position.set(anchoReductor / 2 + 0.002 * escala, -0.02 * escala, largoEstator / 2 + fondoReductor / 2);
  grupo.add(ojoBuey);

  // 8. Piloto LED de estado operativo
  const matPiloto = new THREE.MeshStandardMaterial({
    color: 0x1f3326,
    emissive: 0x000000,
    roughness: 0.2,
  });
  const pilotoLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.009 * escala, 12, 8),
    matPiloto
  );
  pilotoLed.position.set(0, radioEstator + altoCaja + 0.011 * escala, largoCaja * 0.3);
  grupo.add(pilotoLed);

  return {
    grupo,
    setActiva(activa) {
      if (activa) {
        matPiloto.color.set(0x2f8f4e);
        matPiloto.emissive.set(0x22c55e);
        matPiloto.emissiveIntensity = 1.8;
      } else {
        matPiloto.color.set(0x1f3326);
        matPiloto.emissive.set(0x000000);
        matPiloto.emissiveIntensity = 0;
      }
    },
    setAlarma(enAlarma) {
      if (enAlarma) {
        matPiloto.color.set(0x8a2020);
        matPiloto.emissive.set(0xef4444);
        matPiloto.emissiveIntensity = 2.2;
      }
    },
  };
}
