// Escena Three.js: renderizador, cámara orbital, luces, suelo de nave y capa de
// etiquetas CSS2D. Reparte el paso de tiempo de cada fotograma a quien lo pida.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

const VISTA_INICIAL = Object.freeze({
  posicion: new THREE.Vector3(0.45, 5.0, 6.3),
  objetivo: new THREE.Vector3(0.45, 0.4, 0.75),
});
// Tiempo máximo que se recupera por fotograma. main.js lo simula en subpasos de
// 50 ms, así que hasta 1 s de fotograma la planta sigue en tiempo real con el PLC;
// tras una pestaña en segundo plano evita que los paquetes se "teletransporten"
const DT_MAXIMO = 1;

function lineaDeSeguridad(escena, xMin, xMax, zMin, zMax) {
  const material = new THREE.MeshBasicMaterial({ color: 0xe0b000 });
  const ancho = 0.06;
  const tramos = [
    [xMax - xMin, ancho, (xMin + xMax) / 2, zMin], [xMax - xMin, ancho, (xMin + xMax) / 2, zMax],
    [ancho, zMax - zMin, xMin, (zMin + zMax) / 2], [ancho, zMax - zMin, xMax, (zMin + zMax) / 2],
  ];
  for (const [largoX, largoZ, x, z] of tramos) {
    const franja = new THREE.Mesh(new THREE.PlaneGeometry(largoX, largoZ), material);
    franja.rotation.x = -Math.PI / 2;
    franja.position.set(x, 0.002, z);
    escena.add(franja);
  }
}

export function crearEscena(contenedor) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  contenedor.append(renderer.domElement);

  const capaEtiquetas = new CSS2DRenderer();
  capaEtiquetas.domElement.className = 'capa-etiquetas';
  contenedor.append(capaEtiquetas.domElement);

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0xe4e9ef);
  escena.fog = new THREE.Fog(0xe4e9ef, 11, 24);   // funde el borde del suelo con el fondo

  const camara = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
  const controles = new OrbitControls(camara, renderer.domElement);
  controles.enableDamping = true;
  controles.minDistance = 2;
  controles.maxDistance = 14;
  controles.maxPolarAngle = Math.PI / 2.05;

  const reiniciarVista = () => {
    camara.position.copy(VISTA_INICIAL.posicion);
    controles.target.copy(VISTA_INICIAL.objetivo);
    controles.update();
  };
  reiniciarVista();

  // Nave bien iluminada: luz ambiente de cielo claro, una principal con sombras
  // y un relleno desde el lado opuesto para que no queden caras oscuras
  escena.add(new THREE.HemisphereLight(0xffffff, 0xb9c0c9, 2.2));
  const relleno = new THREE.DirectionalLight(0xdfe8f5, 0.9);
  relleno.position.set(-4, 3, -3);
  escena.add(relleno);
  const sol = new THREE.DirectionalLight(0xffffff, 2.2);
  sol.position.set(2.5, 6, 4);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 15 });
  escena.add(sol);

  const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0xcfd4db, roughness: 0.95 }),
  );
  suelo.rotation.x = -Math.PI / 2;
  suelo.receiveShadow = true;
  escena.add(suelo);
  // La niebla se evalúa en los extremos de cada línea: una rejilla mayor que la
  // zona de trabajo dejaría sus líneas largas enteramente dentro de la niebla
  const rejilla = new THREE.GridHelper(16, 32, 0xb7bdc6, 0xb7bdc6);
  rejilla.position.y = 0.001;
  escena.add(rejilla);
  lineaDeSeguridad(escena, -3, 3.75, -1.1, 2.95);   // incluye las estibas de salida

  const redimensionar = () => {
    const { clientWidth: ancho, clientHeight: alto } = contenedor;
    if (!ancho || !alto) return;
    renderer.setSize(ancho, alto);
    capaEtiquetas.setSize(ancho, alto);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
  };
  new ResizeObserver(redimensionar).observe(contenedor);
  redimensionar();

  const actualizaciones = [];
  let instantePrevio = null;
  renderer.setAnimationLoop((instante) => {
    const dt = instantePrevio === null ? 0 : Math.min((instante - instantePrevio) / 1000, DT_MAXIMO);
    instantePrevio = instante;
    for (const actualizar of actualizaciones) actualizar(dt);
    controles.update();
    renderer.render(escena, camara);
    capaEtiquetas.render(escena, camara);
  });

  return {
    escena,
    alActualizar: (funcion) => actualizaciones.push(funcion),
    reiniciarVista,
  };
}
