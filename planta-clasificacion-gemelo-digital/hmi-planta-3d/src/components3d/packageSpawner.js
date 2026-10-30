// Paquetes y estibas: crea cada caja según su tipología física 3D (Express, Frágil,
// Estándar, Pesado Industrial o NO_READ) con dimensiones, color de empaque, peso y
// código de barras visibles en la cara superior, sincronizando las estibas A y B.
import * as THREE from 'three';
import { ESTIBAS, GEOMETRIA, TIPOS_PAQUETE } from '../core/plantModel.js';

const G = GEOMETRIA;

function texturaLateralTipo(defTipo) {
  const lienzo = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = defTipo.colorCaja;
  ctx.fillRect(0, 0, 128, 128);

  // Cinta lateral distintiva
  ctx.fillStyle = defTipo.idTipo === 'fragil' ? '#bae6fd' : '#d8c39a';
  ctx.fillRect(0, 52, 128, 22);

  // Franja inferior de categoría
  ctx.fillStyle = defTipo.colorFranja;
  ctx.fillRect(0, 108, 128, 14);

  ctx.strokeStyle = '#5c4028';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 124);

  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

function texturaSuperiorTipo(defTipo, sku) {
  const lienzo = Object.assign(document.createElement('canvas'), { width: 160, height: 160 });
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = defTipo.colorCaja;
  ctx.fillRect(0, 0, 160, 160);
  ctx.fillStyle = defTipo.idTipo === 'fragil' ? '#bae6fd' : '#d8c39a';
  ctx.fillRect(0, 68, 160, 24);
  ctx.strokeStyle = '#5c4028';
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, 155, 155);

  // Etiqueta térmica blanca
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(18, 16, 124, 84);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 16, 124, 84);

  // Encabezado de color según tipo / SKU
  const colorHeader = sku === 99 ? '#dc2626' : defTipo.colorFranja;
  ctx.fillStyle = colorHeader;
  ctx.fillRect(20, 18, 120, 22);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${defTipo.etiquetaCorta} · ${defTipo.pesoKg}kg`, 80, 33);

  // Ruta objetivo
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px ui-sans-serif, sans-serif';
  ctx.fillText(sku === 99 ? 'CÓDIGO ILEGIBLE' : `DESTINO → ESTIBA ${sku === 2 ? 'B' : 'A'}`, 80, 54);

  // Código de barras
  const patron = [4, 2, 6, 2, 3, 5, 2, 6, 3, 2, 5, 3, 4, 2, 5];
  let x = 28;
  for (let i = 0; i < patron.length; i++) {
    if (i % 2 === 0) ctx.fillRect(x, 60, patron[i], 32);
    x += patron[i] + 1.8;
  }
  if (sku === 99) {
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(24, 60);
    ctx.lineTo(134, 92);
    ctx.stroke();
  }

  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

function crearMallaEstiba() {
  const { largo, ancho, alto } = G.estiba;
  const tabla = 0.022;
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
  const geometrias = new Map();
  const materialesCache = new Map();

  const obtenerGeometria = (idTipo) => {
    const clave = idTipo ?? 'estandar';
    if (!geometrias.has(clave)) {
      const dim = TIPOS_PAQUETE[clave]?.dimensiones ?? G.paquete;
      geometrias.set(clave, new THREE.BoxGeometry(dim.largo, dim.alto, dim.ancho));
    }
    return geometrias.get(clave);
  };

  const obtenerMateriales = (idTipo, sku) => {
    const clave = `${idTipo ?? 'estandar'}:${sku ?? 1}`;
    if (!materialesCache.has(clave)) {
      const def = TIPOS_PAQUETE[idTipo] ?? TIPOS_PAQUETE.estandar;
      const lat = new THREE.MeshStandardMaterial({ map: texturaLateralTipo(def), roughness: 0.82 });
      const sup = new THREE.MeshStandardMaterial({ map: texturaSuperiorTipo(def, sku), roughness: 0.72 });
      materialesCache.set(clave, [lat, lat, sup, lat, lat, lat]);
    }
    return materialesCache.get(clave);
  };

  const materialError = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 });
  const materialAtasco = new THREE.MeshStandardMaterial({ color: 0xd97706, emissive: 0x451a03, roughness: 0.6 });
  const mallas = new Map();

  const estibas = {};
  for (const [rama, { centro, rumbo }] of Object.entries(ESTIBAS)) {
    estibas[rama] = crearMallaEstiba();
    estibas[rama].position.copy(centro);
    estibas[rama].rotation.y = -rumbo;
    escena.add(estibas[rama]);
  }

  const ubicarCaja = (vigentes, paquete) => {
    const { id, posicion, rumbo, malClasificado, atascado, idTipo = 'estandar', sku = 1 } = paquete;
    vigentes.add(id);
    let caja = mallas.get(id);
    if (!caja) {
      caja = new THREE.Mesh(obtenerGeometria(idTipo), obtenerMateriales(idTipo, sku));
      caja.castShadow = true;
      caja.receiveShadow = true;
      escena.add(caja);
      mallas.set(id, caja);
    }
    caja.position.copy(posicion);
    caja.rotation.y = -rumbo;
    if (malClasificado) caja.material = materialError;
    else if (atascado) caja.material = materialAtasco;
    else caja.material = obtenerMateriales(idTipo, sku);
  };

  return {
    sincronizar() {
      const vigentes = new Set();
      for (const paquete of modelo.paquetes) {
        ubicarCaja(vigentes, paquete);
      }
      for (const rama of Object.keys(ESTIBAS)) {
        const pose = modelo.poseEstiba(rama);
        estibas[rama].position.copy(pose);
        const desplazamiento = pose.sub(ESTIBAS[rama].centro);
        for (const apilado of modelo.estibas[rama].paquetes) {
          ubicarCaja(vigentes, {
            ...apilado,
            posicion: apilado.posicion.clone().add(desplazamiento),
          });
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
