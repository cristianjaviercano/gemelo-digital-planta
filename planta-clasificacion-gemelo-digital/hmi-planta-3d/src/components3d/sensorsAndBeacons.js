// Sensor fotoeléctrico de entrada (%IX0.3) con cabezal réflex IP67, catadióptrico,
// conector M12 y baliza luminosa industrial de dos módulos: rojo de alarma (Q4 · %QX0.4)
// y ámbar de cambio de estiba (Q6 · %QX0.6).
import * as THREE from 'three';
import { GEOMETRIA, HAZ_SENSOR } from '../core/plantModel.js';
import { MATERIALES } from './conveyorBelt.js';
import {
  crearSensorIndustrial,
  crearReflectorCatadioptrico,
} from './modelos_3d/index.js';

const G = GEOMETRIA;

export function crearSensor() {
  const grupo = new THREE.Group();
  grupo.name = 'sensor-entrada';
  const centro = HAZ_SENSOR.getCenter(new THREE.Vector3());
  const alcance = HAZ_SENSOR.max.z - HAZ_SENSOR.min.z;

  // 1. Cabezal sensor fotoeléctrico industrial réflex (lado emisor/receptor)
  const zEmisor = HAZ_SENSOR.max.z + 0.025;
  const sensorInd = crearSensorIndustrial();
  sensorInd.grupo.position.set(centro.x, centro.y, zEmisor);
  sensorInd.grupo.rotation.y = -Math.PI / 2; // Apuntando hacia el haz (+z hacia -z)
  grupo.add(sensorInd.grupo);

  // Poste de montaje del sensor
  const posteEmisor = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.28, 0.035),
    MATERIALES.bastidor
  );
  posteEmisor.position.set(centro.x, G.alturaTransporte + 0.03, zEmisor);
  posteEmisor.castShadow = true;
  grupo.add(posteEmisor);

  // 2. Espejo catadióptrico prismático reflectivo (lado opuesto)
  const zReflector = HAZ_SENSOR.min.z - 0.025;
  const reflector = crearReflectorCatadioptrico();
  reflector.position.set(centro.x, centro.y, zReflector);
  reflector.rotation.y = Math.PI / 2; // Enfrentado al sensor
  grupo.add(reflector);

  const posteReflector = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.28, 0.035),
    MATERIALES.bastidor
  );
  posteReflector.position.set(centro.x, G.alturaTransporte + 0.03, zReflector);
  posteReflector.castShadow = true;
  grupo.add(posteReflector);

  // 3. Haz óptico visible infrarrojo/rojo: tenue si está libre, intenso al cortar
  const materialHaz = new THREE.MeshBasicMaterial({
    color: 0xff3b30,
    transparent: true,
    opacity: 0.25,
  });
  const haz = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0035, 0.0035, alcance, 8),
    materialHaz
  );
  haz.rotation.x = Math.PI / 2;
  haz.position.copy(centro);
  grupo.add(haz);

  return {
    grupo,
    mostrar(ocupado, leidoPorPlc) {
      materialHaz.opacity = ocupado ? 0.95 : 0.22;
      sensorInd.setDeteccion(leidoPorPlc);
    },
    puntoEtiqueta: new THREE.Vector3(centro.x - 0.35, G.alturaTransporte + 0.35, HAZ_SENSOR.max.z + 0.15),
  };
}

export function crearBaliza(posicion) {
  const grupo = new THREE.Group();
  grupo.name = 'baliza';
  grupo.position.copy(posicion);

  const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 12), MATERIALES.acero);
  mastil.position.y = 0.8;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 20), MATERIALES.bastidor);
  base.position.y = 0.02;

  // Módulo luminoso: cúpula con estrías tipo Fresnel, luz puntual y destello
  const modulo = (colorApagado, colorEncendido, altura, periodo) => {
    const lampara = new THREE.MeshStandardMaterial({
      color: colorApagado,
      emissive: 0x000000,
      transparent: true,
      opacity: 0.92,
      roughness: 0.25,
      metalness: 0.2,
    });
    const cupula = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 24), lampara);
    cupula.position.y = altura;
    cupula.castShadow = true;

    // Anillo separador negro entre módulos
    const anillo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.072, 0.015, 24),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 })
    );
    anillo.position.y = altura - 0.08;
    grupo.add(anillo);

    const luz = new THREE.PointLight(colorEncendido, 0, 4.5);
    luz.position.y = altura;
    grupo.add(cupula, luz);
    let activa = false;
    let fase = 0;
    return {
      setActiva(valor) {
        activa = valor;
      },
      actualizar(dt) {
        fase = activa ? (fase + dt) % periodo : 0;
        const encendida = activa && fase < periodo / 2;
        lampara.emissive.set(encendida ? colorEncendido : 0x000000);
        lampara.emissiveIntensity = encendida ? 2.4 : 0;
        luz.intensity = encendida ? 7 : 0;
      },
    };
  };

  mastil.castShadow = true;
  grupo.add(mastil, base);
  const roja = modulo(0x5a1c1a, 0xff2a1f, 1.68, 0.5);      // destello a 2 Hz (Alarma)
  const ambar = modulo(0x5a4510, 0xffb000, 1.51, 1.0);     // destello a 1 Hz (Cambio de estiba)

  return {
    grupo,
    setActiva: roja.setActiva,
    setCambioEstiba: ambar.setActiva,
    actualizar(dt) {
      roja.actualizar(dt);
      ambar.actualizar(dt);
    },
    puntoEtiqueta: new THREE.Vector3(posicion.x, 2.0, posicion.z),
    puntoEtiquetaAmbar: new THREE.Vector3(posicion.x - 0.55, 1.45, posicion.z),
  };
}
