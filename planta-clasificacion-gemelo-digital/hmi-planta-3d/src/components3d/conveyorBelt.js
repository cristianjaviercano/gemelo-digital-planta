// Cinta transportadora de alta fidelidad industrial: bastidor de aluminio extruido,
// banda con textura continua que avanza a v_c, patas con perfilería Bosch Rexroth y
// pies niveladores articulados, chumaceras de rodillos, guías laterales inox y
// motorreductor trifásico IEC con aletas, caja de bornes y piloto LED.
import * as THREE from 'three';
import { GEOMETRIA } from '../core/plantModel.js';
import {
  crearMotorreductor,
  crearPataConveyor,
  crearChumacera,
  crearGuiasLaterales,
} from './modelos_3d/index.js';

const G = GEOMETRIA;
const PASO_LISTONES = 0.12;          // m entre listones de la banda
const ESPESOR_BANDA = 0.03;

export const MATERIALES = {
  acero: new THREE.MeshStandardMaterial({ color: 0xd0d7de, metalness: 0.75, roughness: 0.28 }),
  bastidor: new THREE.MeshStandardMaterial({ color: 0x8a95a5, metalness: 0.5, roughness: 0.45 }),
  motor: new THREE.MeshStandardMaterial({ color: 0x245a8a, metalness: 0.45, roughness: 0.4 }),
};

// Textura de la banda transportadora con listones antideslizantes
function texturaBanda() {
  const lienzo = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const ctx = lienzo.getContext('2d');
  // Fondo de caucho reforzado
  ctx.fillStyle = '#474d56';
  ctx.fillRect(0, 0, 128, 128);
  // Relieve del listón transversal
  ctx.fillStyle = '#5c6470';
  ctx.fillRect(0, 0, 18, 128);
  ctx.fillStyle = '#373c44';
  ctx.fillRect(18, 0, 4, 128);
  // Microtextura de agarre
  for (let y = 0; y < 128; y += 8) {
    ctx.fillStyle = '#3f444c';
    ctx.fillRect(26, y, 98, 2);
  }
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
  return textura;
}

const malla = (geometria, material, { sombra = true } = {}) => {
  const m = new THREE.Mesh(geometria, material);
  m.castShadow = sombra;
  m.receiveShadow = true;
  return m;
};

// `desde`/`hasta`: extremos del eje de la banda en el plano x–z. `desfaseZ`
// desplaza la banda respecto de su eje y `largueros` indica qué costados llevan larguero.
export function crearCinta({
  nombre, desde, hasta, ancho = G.anchoCinta, desfaseZ = 0, conMotor = true, largueros = [-1, 1], cota = 0,
}) {
  const largo = desde.distanceTo(hasta);
  const rumbo = Math.atan2(hasta.z - desde.z, hasta.x - desde.x);
  const h = G.alturaTransporte + cota;

  const grupo = new THREE.Group();
  grupo.name = nombre;
  grupo.position.set((desde.x + hasta.x) / 2, 0, (desde.z + hasta.z) / 2);
  grupo.rotation.y = -rumbo;         // eje local +x a lo largo de la banda

  // 1. Banda transportadora con textura de tracción
  const textura = texturaBanda();
  textura.repeat.set(largo / PASO_LISTONES, 1);
  const superficie = new THREE.MeshStandardMaterial({ map: textura, roughness: 0.85, metalness: 0.1 });
  const lateral = new THREE.MeshStandardMaterial({ color: 0x32363d, roughness: 0.9 });
  const banda = malla(
    new THREE.BoxGeometry(largo, ESPESOR_BANDA, ancho),
    [lateral, lateral, superficie, lateral, lateral, lateral],
    { sombra: false }
  );
  banda.position.set(0, h - ESPESOR_BANDA / 2, desfaseZ);
  grupo.add(banda);

  // 2. Largueros laterales del bastidor
  for (const lado of largueros) {
    const larguero = malla(new THREE.BoxGeometry(largo, 0.09, 0.035), MATERIALES.bastidor);
    larguero.position.set(0, h - 0.035, desfaseZ + lado * (ancho / 2 + 0.0175));
    grupo.add(larguero);
  }

  // 3. Rodillos de reenvío en los extremos con chumaceras embridadas
  for (const extremo of [-1, 1]) {
    const xPos = extremo * (largo / 2 - 0.02);
    const rodillo = malla(new THREE.CylinderGeometry(0.035, 0.035, ancho, 20), MATERIALES.acero);
    rodillo.rotation.x = Math.PI / 2;
    rodillo.position.set(xPos, h - 0.035, desfaseZ);
    grupo.add(rodillo);

    // Chumaceras con grasera en cada extremo del rodillo
    for (const lado of [-1, 1]) {
      const chumacera = crearChumacera({ radio: 0.034 });
      chumacera.position.set(xPos, h - 0.035, desfaseZ + lado * (ancho / 2 + 0.028));
      grupo.add(chumacera);
    }
  }

  // 4. Patas con perfilería estructural tipo Bosch Rexroth y pies niveladores
  const pares = Math.max(2, Math.ceil(largo / 0.9) + 1);
  const alturaPata = h - 0.06;
  for (let i = 0; i < pares; i++) {
    const x = -largo / 2 + 0.08 + (i * (largo - 0.16)) / (pares - 1);
    for (const lado of [-1, 1]) {
      const pata = crearPataConveyor({ altura: alturaPata, grosor: 0.042 });
      pata.position.set(x, 0, desfaseZ + lado * (ancho / 2 + 0.015));
      grupo.add(pata);
    }

    // Travesaño de unión horizontal entre cada par de patas
    const travesano = malla(
      new THREE.BoxGeometry(0.035, 0.035, ancho + 0.02),
      MATERIALES.bastidor
    );
    travesano.position.set(x, alturaPata * 0.4, desfaseZ);
    grupo.add(travesano);
  }

  // 5. Guías laterales continuas de acero inoxidable regulables
  if (largueros.length > 0) {
    const guias = crearGuiasLaterales({
      largo,
      anchoTransporte: ancho,
      alturaTransporte: h,
      lados: largueros,
    });
    guias.position.z = desfaseZ;
    grupo.add(guias);
  }

  // 6. Motorreductor industrial trifásico de alta fidelidad
  let motorRef = null;
  if (conMotor) {
    motorRef = crearMotorreductor({ escala: 1.05 });
    motorRef.grupo.rotation.y = Math.PI / 2;
    motorRef.grupo.position.set(
      largo / 2 - 0.06,
      h - 0.09,
      desfaseZ - (ancho / 2 + 0.14)
    );
    grupo.add(motorRef.grupo);
  }

  const cinta = {
    grupo,
    activa: false,
    setActiva(activa) {
      cinta.activa = activa;
      if (motorRef) motorRef.setActiva(activa);
    },
    actualizar(dt) {
      if (cinta.activa) textura.offset.x -= (G.vCinta * dt) / PASO_LISTONES;
    },
    // Punto sobre la cinta donde anclar su etiqueta, en coordenadas del mundo
    puntoEtiqueta: new THREE.Vector3((desde.x + hasta.x) / 2, h + 0.45, (desde.z + hasta.z) / 2),
  };
  return cinta;
}
