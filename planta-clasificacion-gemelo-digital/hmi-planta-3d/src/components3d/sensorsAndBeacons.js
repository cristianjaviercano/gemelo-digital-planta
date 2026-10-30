// Instrumentación 3D de planta:
// - Sensor fotoeléctrico de entrada (%IX0.3) + Pórtico Lector Láser de Código de Barras
// - Tope neumático indexador de admisión (%QX0.7 Stopper_Admision)
// - Fotoceldas de confirmación de salida A (%IX0.7) y B (%IX1.0)
// - Torreta luminosa industrial de 3 niveles: Rojo (%QX0.4), Ámbar (%QX0.6) y Verde (%QX1.2)
import * as THREE from 'three';
import { GEOMETRIA, HAZ_SENSOR, SENSORES_SALIDA } from '../core/plantModel.js';
import { MATERIALES } from './conveyorBelt.js';
import {
  crearSensorIndustrial,
  crearReflectorCatadioptrico,
} from './modelos_3d/index.js';

const G = GEOMETRIA;

export function crearSensor() {
  const grupo = new THREE.Group();
  grupo.name = 'sensor-entrada-y-escaner';
  const centro = HAZ_SENSOR.getCenter(new THREE.Vector3());
  const alcance = HAZ_SENSOR.max.z - HAZ_SENSOR.min.z;

  // 1. Cabezal sensor fotoeléctrico industrial réflex (%IX0.3)
  const zEmisor = HAZ_SENSOR.max.z + 0.025;
  const sensorInd = crearSensorIndustrial();
  sensorInd.grupo.position.set(centro.x, centro.y, zEmisor);
  sensorInd.grupo.rotation.y = -Math.PI / 2;
  grupo.add(sensorInd.grupo);

  const posteEmisor = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.28, 0.035), MATERIALES.bastidor);
  posteEmisor.position.set(centro.x, G.alturaTransporte + 0.03, zEmisor);
  posteEmisor.castShadow = true;
  grupo.add(posteEmisor);

  // 2. Espejo catadióptrico reflectivo
  const zReflector = HAZ_SENSOR.min.z - 0.025;
  const reflector = crearReflectorCatadioptrico();
  reflector.position.set(centro.x, centro.y, zReflector);
  reflector.rotation.y = Math.PI / 2;
  grupo.add(reflector);

  const posteReflector = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.28, 0.035), MATERIALES.bastidor);
  posteReflector.position.set(centro.x, G.alturaTransporte + 0.03, zReflector);
  posteReflector.castShadow = true;
  grupo.add(posteReflector);

  // 3. Haz óptico horizontal (%IX0.3)
  const materialHaz = new THREE.MeshBasicMaterial({
    color: 0xff3b30,
    transparent: true,
    opacity: 0.25,
  });
  const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, alcance, 8), materialHaz);
  haz.rotation.x = Math.PI / 2;
  haz.position.copy(centro);
  grupo.add(haz);

  // 4. Pórtico superior de lectura de código de barras / visión industrial (%MW1)
  const altoPortico = 0.44;
  const anchoPortico = alcance + 0.08;
  const matAluminio = MATERIALES.acero;
  const columnaIzq = new THREE.Mesh(new THREE.BoxGeometry(0.03, altoPortico, 0.03), matAluminio);
  columnaIzq.position.set(centro.x, G.alturaTransporte + altoPortico / 2, zEmisor + 0.02);
  const columnaDer = columnaIzq.clone();
  columnaDer.position.z = zReflector - 0.02;
  const travesano = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, anchoPortico + 0.04), matAluminio);
  travesano.position.set(centro.x, G.alturaTransporte + altoPortico, 0);

  // Cabezal lector láser industrial (carcasa azul oscuro/amarillo tipo SICK/Cognex)
  const matEscaner = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35, metalness: 0.45 });
  const cabezalEscaner = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.065, 0.14), matEscaner);
  cabezalEscaner.position.set(centro.x, G.alturaTransporte + altoPortico - 0.045, 0);
  cabezalEscaner.castShadow = true;

  // Abanico láser cenital de lectura de código de barras
  const matAbanico = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
  });
  const abanico = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.32), matAbanico);
  abanico.position.set(centro.x, G.alturaTransporte + 0.23, 0);
  abanico.rotation.y = Math.PI / 2;

  grupo.add(columnaIzq, columnaDer, travesano, cabezalEscaner, abanico);

  return {
    grupo,
    mostrar(ocupado, leidoPorPlc) {
      materialHaz.opacity = ocupado ? 0.95 : 0.22;
      matAbanico.opacity = ocupado ? 0.72 : 0.12;
      sensorInd.setDeteccion(leidoPorPlc);
    },
    puntoEtiqueta: new THREE.Vector3(centro.x - 0.32, G.alturaTransporte + 0.48, HAZ_SENSOR.max.z + 0.12),
  };
}

// Fotoceldas de confirmación de salida en extremo de bandas A (%IX0.7) y B (%IX1.0)
export function crearSensorSalida(rama) {
  const cfg = SENSORES_SALIDA[rama];
  const grupo = new THREE.Group();
  grupo.name = `sensor-salida-${rama.toLowerCase()}`;
  grupo.position.copy(cfg.centro);
  grupo.rotation.y = -cfg.rumbo;

  const alcance = G.anchoCinta + 0.12;
  const zEmisor = alcance / 2 + 0.025;
  const zReflector = -alcance / 2 - 0.025;

  const sensorInd = crearSensorIndustrial();
  sensorInd.grupo.position.set(0, 0, zEmisor);
  sensorInd.grupo.rotation.y = -Math.PI / 2;
  grupo.add(sensorInd.grupo);

  const posteEmisor = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.26, 0.032), MATERIALES.bastidor);
  posteEmisor.position.set(0, -0.055, zEmisor);
  grupo.add(posteEmisor);

  const reflector = crearReflectorCatadioptrico();
  reflector.position.set(0, 0, zReflector);
  reflector.rotation.y = Math.PI / 2;
  grupo.add(reflector);

  const posteReflector = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.26, 0.032), MATERIALES.bastidor);
  posteReflector.position.set(0, -0.055, zReflector);
  grupo.add(posteReflector);

  const materialHaz = new THREE.MeshBasicMaterial({
    color: 0xff3b30,
    transparent: true,
    opacity: 0.22,
  });
  const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, alcance, 8), materialHaz);
  haz.rotation.x = Math.PI / 2;
  grupo.add(haz);

  const puntoEtiqueta = cfg.centro.clone()
    .addScaledVector(cfg.normal, (rama === 'A' ? -1 : 1) * 0.34)
    .setY(G.alturaTransporte + 0.32);

  return {
    grupo,
    mostrar(ocupado, leidoPorPlc) {
      materialHaz.opacity = ocupado ? 0.95 : 0.22;
      sensorInd.setDeteccion(leidoPorPlc);
    },
    puntoEtiqueta,
  };
}

// Tope neumático indexador de admisión (%QX0.7 Stopper_Admision) antes del sensor de entrada
export function crearStopperAdmision() {
  const grupo = new THREE.Group();
  grupo.name = 'stopper-admision';
  grupo.position.set(G.xStopper, G.alturaTransporte, 0);

  // Carcasa neumática bajo banda
  const carcasa = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.09, G.anchoCinta * 0.72),
    MATERIALES.bastidor,
  );
  carcasa.position.y = -0.048;
  grupo.add(carcasa);

  // Cuchilla retenedora amarilla/roja de alta visibilidad que emerge al activarse %QX0.7
  const matCuchilla = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.35,
    metalness: 0.4,
  });
  const cuchilla = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.09, G.anchoCinta * 0.68),
    matCuchilla,
  );
  cuchilla.position.y = -0.04;
  cuchilla.castShadow = true;
  grupo.add(cuchilla);

  let activo = false;
  let alturaActual = -0.04;

  return {
    grupo,
    setActivo(valor) {
      activo = Boolean(valor);
    },
    actualizar(dt) {
      const objetivo = activo ? 0.042 : -0.042;
      alturaActual += (objetivo - alturaActual) * Math.min(1, dt * 18);
      cuchilla.position.y = alturaActual;
      matCuchilla.emissive.setHex(activo ? 0x451a03 : 0x000000);
    },
    puntoEtiqueta: new THREE.Vector3(G.xStopper - 0.15, G.alturaTransporte + 0.25, -G.anchoCinta / 2 - 0.12),
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

  const modulo = (colorApagado, colorEncendido, altura, periodo = 0) => {
    const lampara = new THREE.MeshStandardMaterial({
      color: colorApagado,
      emissive: 0x000000,
      transparent: true,
      opacity: 0.92,
      roughness: 0.25,
      metalness: 0.2,
    });
    const cupula = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 24), lampara);
    cupula.position.y = altura;
    cupula.castShadow = true;

    const anillo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.072, 0.015, 24),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 }),
    );
    anillo.position.y = altura - 0.07;
    grupo.add(anillo);

    const luz = new THREE.PointLight(colorEncendido, 0, 4.2);
    luz.position.y = altura;
    grupo.add(cupula, luz);
    let activa = false;
    let fase = 0;
    return {
      setActiva(valor) {
        activa = Boolean(valor);
      },
      actualizar(dt) {
        let encendida = activa;
        if (periodo > 0) {
          fase = activa ? (fase + dt) % periodo : 0;
          encendida = activa && fase < periodo / 2;
        }
        lampara.emissive.set(encendida ? colorEncendido : 0x000000);
        lampara.emissiveIntensity = encendida ? 2.2 : 0;
        luz.intensity = encendida ? (periodo > 0 ? 6.5 : 3.2) : 0;
      },
    };
  };

  mastil.castShadow = true;
  grupo.add(mastil, base);
  const roja = modulo(0x5a1c1a, 0xff2a1f, 1.70, 0.5);     // %QX0.4 Alarma / Emergencia / Atasco (2 Hz)
  const ambar = modulo(0x5a4510, 0xffb000, 1.54, 1.0);    // %QX0.6 Estiba / Inspección NO_READ (1 Hz)
  const verde = modulo(0x14432a, 0x22c55e, 1.38, 0);      // %QX1.2 Línea en marcha (continua)

  return {
    grupo,
    setActiva: roja.setActiva,
    setCambioEstiba: ambar.setActiva,
    setVerde: verde.setActiva,
    actualizar(dt) {
      roja.actualizar(dt);
      ambar.actualizar(dt);
      verde.actualizar(dt);
    },
    puntoEtiqueta: new THREE.Vector3(posicion.x, 2.02, posicion.z),
    puntoEtiquetaAmbar: new THREE.Vector3(posicion.x - 0.55, 1.48, posicion.z),
  };
}
