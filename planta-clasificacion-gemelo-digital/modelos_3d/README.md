# Catálogo de Modelos y Componentes 3D Industriales · Gemelo Digital

Este directorio almacena la especificación técnica, arquitectura paramétrica y catálogo de componentes 3D de alta fidelidad mecánica para la **Planta de Clasificación Automatizada (Virtual Commissioning)**.

---

## 1. Filosofía de Modelado y Renderizado

Para garantizar **tiempos de carga inmediatos (< 200 ms)**, compatibilidad multiplataforma (Web / WebGL / WebGPU) y máxima fidelidad de renderizado sin dependencias pesadas de mallas externas, el gemelo digital implementa una **arquitectura paramétrica híbrida**:

1. **Generación Paramétrica Procedural (Three.js PBR):**
   - Materiales físicos basados en microfacetas (*Physically Based Rendering* - PBR: `MeshStandardMaterial` con `metalness`, `roughness`, `normalMap` procedural y canales emisivos).
   - Paleta de color industrial normalizada:
     - **Azul Maquinaria:** RAL 5012 / RAL 5015 (motores y actuadores).
     - **Gris Bastidor:** RAL 7035 Gris Claro / RAL 7016 Gris Antracita (perfiles de aluminio y armarios).
     - **Amarillo Seguridad:** RAL 1021 Colza (líneas de delimitación y elementos móviles/desviador).
     - **Acero Rectificado / Inox:** AISI 304 / 316 (ejes, rodillos, vástagos de pistón y tornillería).
     - **Poliuretano / Elastómero:** Mangueras neumáticas y amortiguadores.
   - Sombreado de alta definición con mapas de sombras PCF (*Percentage-Closer Filtering* 2048×2048) y oclusión ambiental simulada por geometría.

2. **Compatibilidad con Importación CAD / GLTF / GLB:**
   - La arquitectura está lista para incorporar mallas CAD exportadas desde SolidWorks, Inventor, STEP o Blender en formato `.glb` / `.gltf` ubicadas en `modelos_3d/assets/` mediante `GLTFLoader`.

---

## 2. Catálogo de Componentes de Alta Fidelidad

| Componente | Módulo Código | Descripción Técnica y Normativa |
|---|---|---|
| **Motorreductor Trifásico** | `motorreductorIndustrial.js` | Motor asíncrono con aletas de disipación, ventilador trasero con cubierta, caja de bornes con prensaestopas M20, reductor con brida B5, eje con chavetero DIN 6885 y piloto LED. |
| **Mesa y Bastidores Conveyor** | `mesaEstructuraConveyor.js` | Perfilería de aluminio estructural tipo Bosch Rexroth 45×45 con ranuras en T, patas tubulares con pies autonivelantes articulados M16, tirantes de rigidización, guías laterales inox y chumaceras con grasera. |
| **Mecanismo Desviador Neumático** | `actuadorNeumaticoDesviador.js` | Cilindro neumático normalizado ISO 15552, vástago cromado espejo, racores Push-in, mangueras neumáticas flexibles azules, paleta deflectora con franja de absorción de impacto UHMW. |
| **Puesto de Detección Óptica** | `sensorFotoelectricoIndustrial.js` | Sensor réflex industrial IP67 tipo SICK/Omron con soporte ranurado micrométrico, conector M12 con cable apantallado y catadióptrico prismático reflectivo. |
| **Armario Eléctrico de Control PLC** | `armarioElectricoPLC.js` | Gabinete Rittal / Schneider IP65 con zócalo, cerradura de doble paletón, botonera industrial (Marcha/Parada/Emergencia/Selector), baliza multitono y pantalla táctil HMI integrada. |
| **Palets y Estibas de Despacho** | `packageSpawner.js` | Estibas de madera europalet EUR 1 (1200×800×144 mm / 1200×1000 mm) con tablas clavadas, dados de soporte y animación de cambio de estiba. |

---

## 3. Estructura de Archivos

```
modelos_3d/
├── README.md                          # Este documento (especificación técnica)
└── assets/                            # Directorio para modelos externos GLB / GLTF / texturas (opcional)
hmi-planta-3d/src/components3d/modelos_3d/
├── motorreductorIndustrial.js         # Constructor paramétrico de motorreductores
├── mesaEstructuraConveyor.js          # Constructor paramétrico de bastidores y perfilería
├── actuadorNeumaticoDesviador.js      # Constructor del cilindro neumático y desviación
├── sensorFotoelectricoIndustrial.js   # Sensor réflex industrial y catadióptrico
└── armarioElectricoPLC.js             # Gabinete industrial de mando y control PLC
```
