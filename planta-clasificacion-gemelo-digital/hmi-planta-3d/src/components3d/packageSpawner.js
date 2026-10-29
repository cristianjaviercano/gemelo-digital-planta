// Paquetes y estibas: crea una caja por cada paquete del modelo (en las cintas,
// en vuelo hacia la estiba o ya apilado) y mueve cada estiba con su carga cuando
// se cambia. Las posiciones las decide el modelo; aquí solo se dibujan.
import * as THREE from 'three';
import { ESTIBAS, GEOMETRIA } from '../core/plantModel.js';

const G = GEOMETRIA;

function texturaCarton() {
  const lienzo = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#b48a5a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#d8c39a';            // cinta de embalar
  ctx.fillRect(0, 26, 64, 12);
  ctx.strokeStyle = '#7d5a35';          // aristas: cada caja se distingue de sus vecinas en la estiba
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 61, 61);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

// Estiba de madera: tablas superiores en el sentido de la ruta, tres largueros
// transversales y tablas inferiores. Eje local +x a lo largo de la ruta.
function crearMallaEstiba() {
  const { largo, ancho, alto } = G.estiba;
  const tabla = 0.022;
  // Pino claro, para que la carga de cartón contraste con la estiba
  const madera = new THREE.MeshStandardMaterial({ color: 0xe0d2b4, roughness: 0.9 });
  const larguero = new THREE.MeshStandardMaterial({ color: 0xc2b08c, roughness: 0.9 });
  const grupo = new THREE.Group();
  const pieza = (dimensiones, material, posicion) => {
    const malla = new THREE.Mesh(new THREE.BoxGeometry(...dimensiones), material);
    malla.position.set(...posicion);
    malla.castShadow = malla.receiveShadow = true;
    grupo.add(malla);
  };
  for (let i = 0; i < 7; i++) {
    pieza([largo, tabla, 0.1], madera, [0, alto - tabla / 2, -ancho / 2 + 0.05 + (i * (ancho - 0.1)) / 6]);
  }
  for (const a of [-largo / 2 + 0.05, 0, largo / 2 - 0.05]) {
    pieza([0.1, alto - 2 * tabla, ancho], larguero, [a, alto / 2, 0]);
  }
  for (const b of [-ancho / 2 + 0.05, 0, ancho / 2 - 0.05]) {
    pieza([largo, tabla, 0.1], madera, [0, tabla / 2, b]);
  }
  return grupo;
}

export function crearGestorPaquetes(escena, modelo) {
  const { largo, ancho, alto } = G.paquete;
  const geometria = new THREE.BoxGeometry(largo, alto, ancho);
  const material = new THREE.MeshStandardMaterial({ map: texturaCarton(), roughness: 0.85 });
  const materialError = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 });
  const mallas = new Map();

  const estibas = {};
  for (const [rama, { centro, rumbo }] of Object.entries(ESTIBAS)) {
    estibas[rama] = crearMallaEstiba();
    estibas[rama].position.copy(centro);
    estibas[rama].rotation.y = -rumbo;
    escena.add(estibas[rama]);
  }

  const ubicarCaja = (vigentes, id, posicion, rumbo, malClasificado) => {
    vigentes.add(id);
    let caja = mallas.get(id);
    if (!caja) {
      caja = new THREE.Mesh(geometria, material);
      caja.castShadow = true;
      caja.receiveShadow = true;
      escena.add(caja);
      mallas.set(id, caja);
    }
    caja.position.copy(posicion);
    caja.rotation.y = -rumbo;
    caja.material = malClasificado ? materialError : material;
  };

  return {
    sincronizar() {
      const vigentes = new Set();
      for (const paquete of modelo.paquetes) {
        ubicarCaja(vigentes, paquete.id, paquete.posicion, paquete.rumbo, paquete.malClasificado);
      }
      // Cada estiba y su carga se desplazan juntas durante el cambio
      for (const rama of Object.keys(ESTIBAS)) {
        const pose = modelo.poseEstiba(rama);
        estibas[rama].position.copy(pose);
        const desplazamiento = pose.sub(ESTIBAS[rama].centro);
        for (const apilado of modelo.estibas[rama].paquetes) {
          ubicarCaja(vigentes, apilado.id, apilado.posicion.clone().add(desplazamiento), apilado.rumbo, apilado.malClasificado);
        }
      }
      for (const [id, caja] of mallas) {
        if (!vigentes.has(id)) {
          escena.remove(caja);
          mallas.delete(id);
        }
      }
    },
  };
}
