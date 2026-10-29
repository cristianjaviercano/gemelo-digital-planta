// Desviador de paleta (Q1 · %QX0.1) con actuador neumático ISO 15552,
// racores rápidos, mangueras azules Festo y paleta deflectora de absorción de impacto.
// En reposo la paleta queda a lo largo del borde de la cinta (ruta A);
// energizado gira 45° y guía el paquete hacia la ruta B.
import * as THREE from 'three';
import { GEOMETRIA } from '../core/plantModel.js';
import { MATERIALES } from './conveyorBelt.js';
import {
  crearCilindroNeumatico,
  crearPaletaDeflectora,
} from './modelos_3d/index.js';

const G = GEOMETRIA;
const TIEMPO_RECORRIDO = 0.15;       // s de A a B (actuador neumático)
const LARGO_PALETA = 0.75;
const HOLGURA = 0.02;                // entre la paleta y el costado del paquete

// La pared de la paleta en B es paralela a la ruta B, desplazada medio paquete
// hacia −z; el pivote es su corte con el borde de la cinta (z = −ancho/2)
function calcularPivote() {
  const theta = G.anguloRutaB;
  const desplazamiento = G.paquete.ancho / 2 + HOLGURA;
  const puntoPared = new THREE.Vector3(
    G.xDecision + Math.sin(theta) * desplazamiento, 0, -Math.cos(theta) * desplazamiento);
  const k = (-G.anchoCinta / 2 - puntoPared.z) / Math.sin(theta);
  return puntoPared.add(new THREE.Vector3(Math.cos(theta) * k, 0, Math.sin(theta) * k));
}

export function crearDesviador() {
  const pivote = calcularPivote();
  const h = G.alturaTransporte;

  const grupo = new THREE.Group();
  grupo.name = 'desviador';
  grupo.position.copy(pivote);

  // 1. Brazo oscilante con paleta deflectora de alta fidelidad
  const brazo = new THREE.Group();
  const paleta = crearPaletaDeflectora({
    largo: LARGO_PALETA,
    alto: 0.12,
    espesor: 0.022,
  });
  paleta.position.set(LARGO_PALETA / 2, h + 0.075, 0);
  brazo.add(paleta);
  grupo.add(brazo);

  // 2. Eje vertical de giro de acero con rodamiento cónico
  const eje = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.28, 20),
    MATERIALES.acero
  );
  eje.position.set(0, h + 0.03, 0);
  eje.castShadow = true;
  grupo.add(eje);

  // Brida de fijación del eje al bastidor
  const bridaPivote = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.06, 0.02, 16),
    MATERIALES.bastidor
  );
  bridaPivote.position.set(0, h - 0.09, 0);
  grupo.add(bridaPivote);

  // 3. Cilindro neumático ISO 15552 detallado
  const neumatico = crearCilindroNeumatico();
  neumatico.grupo.position.set(-0.06, h + 0.02, -0.15);
  neumatico.grupo.rotation.y = -Math.PI / 6;
  grupo.add(neumatico.grupo);

  const desviador = {
    grupo,
    posicion: 0,
    objetivo: 0,
    setObjetivoB(enB) {
      desviador.objetivo = enB ? 1 : 0;
    },
    actualizar(dt) {
      const paso = dt / TIEMPO_RECORRIDO;
      const diferencia = desviador.objetivo - desviador.posicion;
      desviador.posicion += Math.sign(diferencia) * Math.min(Math.abs(diferencia), paso);
      brazo.rotation.y = -G.anguloRutaB * desviador.posicion;   // rotar +x hacia +z

      // Cinemática del vástago neumático
      if (neumatico.vastago) {
        neumatico.vastago.position.x = 0.08 + 0.05 * desviador.posicion;
      }
    },
    puntoEtiqueta: new THREE.Vector3(pivote.x + 0.35, h + 0.75, pivote.z - 0.25),
  };
  return desviador;
}
