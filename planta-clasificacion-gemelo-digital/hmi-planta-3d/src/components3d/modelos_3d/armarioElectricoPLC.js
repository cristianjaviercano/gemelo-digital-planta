// Componente 3D Paramétrico: Armario Eléctrico de Control PLC y SCADA
// Gabinete industrial RAL 7035 con zócalo, cerradura de seguridad,
// botonera de campo (Marcha/Parada/Emergencia/Selector) y pantalla HMI empotrada.
import * as THREE from 'three';

export const MATERIALES_ARMARIO = {
  gabineteGris: new THREE.MeshStandardMaterial({
    color: 0xd1d5db,      // RAL 7035 Gris Claro electrostático
    metalness: 0.35,
    roughness: 0.45,
  }),
  zocaloNegro: new THREE.MeshStandardMaterial({
    color: 0x1f2937,      // Zócalo inferior reforzado
    metalness: 0.4,
    roughness: 0.6,
  }),
  marcoPuerta: new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    metalness: 0.4,
    roughness: 0.4,
  }),
  pantallaHmi: new THREE.MeshStandardMaterial({
    color: 0x0f172a,      // Marco HMI industrial
    metalness: 0.7,
    roughness: 0.25,
  }),
  displayVidrio: new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0x0369a1,
    emissiveIntensity: 0.35,
    roughness: 0.1,
  }),
  botonVerde: new THREE.MeshStandardMaterial({
    color: 0x15803d,
    emissive: 0x22c55e,
    emissiveIntensity: 0.5,
  }),
  botonRojo: new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    emissive: 0xef4444,
    emissiveIntensity: 0.4,
  }),
  setaEmergencia: new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.3,
  }),
  collarAmarillo: new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.4,
  }),
  manetaCerradura: new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.8,
    roughness: 0.3,
  }),
};

/**
 * Crea el armario eléctrico de control de la celda de clasificación.
 */
export function crearArmarioControl({ ancho = 0.65, alto = 1.45, fondo = 0.4 } = {}) {
  const grupo = new THREE.Group();
  grupo.name = 'armario-control-plc';

  const M = MATERIALES_ARMARIO;
  const altoZocalo = 0.1;
  const altoCuerpo = alto - altoZocalo;

  // 1. Zócalo inferior
  const zocalo = new THREE.Mesh(
    new THREE.BoxGeometry(ancho * 0.96, altoZocalo, fondo * 0.94),
    M.zocaloNegro
  );
  zocalo.position.y = altoZocalo / 2;
  zocalo.castShadow = true;
  zocalo.receiveShadow = true;
  grupo.add(zocalo);

  // 2. Gabinete principal
  const cuerpo = new THREE.Mesh(
    new THREE.BoxGeometry(ancho, altoCuerpo, fondo),
    M.gabineteGris
  );
  cuerpo.position.y = altoZocalo + altoCuerpo / 2;
  cuerpo.castShadow = true;
  cuerpo.receiveShadow = true;
  grupo.add(cuerpo);

  // Cáncamos de izado en el techo
  for (const xOff of [-ancho / 2 + 0.05, ancho / 2 - 0.05]) {
    const cancamo = new THREE.Mesh(
      new THREE.TorusGeometry(0.018, 0.005, 8, 16),
      M.manetaCerradura
    );
    cancamo.position.set(xOff, alto + 0.015, 0);
    cancamo.castShadow = true;
    grupo.add(cancamo);
  }

  // 3. Puerta frontal con maneta basculante
  const puerta = new THREE.Mesh(
    new THREE.BoxGeometry(ancho * 0.96, altoCuerpo * 0.94, 0.015),
    M.marcoPuerta
  );
  puerta.position.set(0, altoZocalo + altoCuerpo / 2, fondo / 2 + 0.008);
  puerta.castShadow = true;
  grupo.add(puerta);

  // Maneta basculante con cerradura
  const maneta = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.12, 0.02),
    M.manetaCerradura
  );
  maneta.position.set(ancho * 0.38, altoZocalo + altoCuerpo * 0.5, fondo / 2 + 0.022);
  maneta.castShadow = true;
  grupo.add(maneta);

  // 4. Pantalla táctil HMI empotrada
  const marcoHmi = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.16, 0.012),
    M.pantallaHmi
  );
  marcoHmi.position.set(0, altoZocalo + altoCuerpo * 0.72, fondo / 2 + 0.02);
  grupo.add(marcoHmi);

  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(0.21, 0.13),
    M.displayVidrio
  );
  display.position.set(0, altoZocalo + altoCuerpo * 0.72, fondo / 2 + 0.027);
  grupo.add(display);

  // 5. Botonera industrial de mando
  const cotaBotonera = altoZocalo + altoCuerpo * 0.45;
  const zBotones = fondo / 2 + 0.022;

  // Pulsador Marcha (Verde rasante)
  const btnMarcha = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.014, 16),
    M.botonVerde
  );
  btnMarcha.rotation.x = Math.PI / 2;
  btnMarcha.position.set(-0.14, cotaBotonera, zBotones);
  grupo.add(btnMarcha);

  // Pulsador Parada (Rojo rasante)
  const btnParada = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.014, 16),
    M.botonRojo
  );
  btnParada.rotation.x = Math.PI / 2;
  btnParada.position.set(-0.05, cotaBotonera, zBotones);
  grupo.add(btnParada);

  // Seta de Paro de Emergencia con corona amarilla
  const corona = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.005, 24),
    M.collarAmarillo
  );
  corona.rotation.x = Math.PI / 2;
  corona.position.set(0.06, cotaBotonera, zBotones - 0.004);
  grupo.add(corona);

  const seta = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.018, 0.028, 20),
    M.setaEmergencia
  );
  seta.rotation.x = Math.PI / 2;
  seta.position.set(0.06, cotaBotonera, zBotones + 0.01);
  seta.castShadow = true;
  grupo.add(seta);

  // Selector de llave (2 posiciones)
  const selector = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.01, 0.022),
    M.manetaCerradura
  );
  selector.position.set(0.16, cotaBotonera, zBotones);
  grupo.add(selector);

  return grupo;
}
