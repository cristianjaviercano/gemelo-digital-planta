# Planta Virtual de Clasificación Gobernada por PLC (Virtual Commissioning)

Gemelo digital de tres capas: **PLC (IEC 61131-3)** → **Modbus TCP** → **Node.js** → **WebSocket** → **Three.js**. Se desarrolla en macOS con un PLC virtual; en el laboratorio SILOGE (Windows) el PLC es CODESYS.

| Carpeta | Capa | Estado |
|---|---|---|
| `docs/` | Documentación ([índice](docs/README.md)) | Arquitectura, BPMN, manuales (con una sección sobre el PLC y su emulación), teoría y especificación de la Fase 5 |
| `plc-codesys/` | Control (ST) · programa del laboratorio y fuente de verdad | Lógica ✔ (Fases 2 y 5: estado S5 de estibas) · CP-01…19 pendientes en CODESYS |
| `plc-virtual/` | Control (Node.js) · sustituto de CODESYS en macOS | CP-01…19 automatizados ✔ |
| `puente-modbus-planta/` | Middleware | Fase 3 ✔ · contrato v1.1.0 · probado contra el PLC virtual |
| `hmi-planta-3d/` | HMI/SCADA 3D | Fase 4 ✔ · estibas con colocación animada ✔ · probada en navegador contra el PLC virtual |
| `windows/` | Laboratorio SILOGE | Guía CODESYS, `.env` de Windows y registro de cambios |

Requisito: Node.js ≥ 20.19 (recomendado 22 LTS).

## macOS

*Doble clic en «Planta de Clasificación.app»* (en esta carpeta): abre Terminal, arranca las tres capas y abre la HMI en el navegador. Ctrl+C o cerrar esa ventana detiene la simulación. Si se mueve o se clona el proyecto, `bash herramientas/lanzador_macos/crear_lanzador.sh` regenera la aplicación. Equivale a ejecutar `./iniciar.sh`.

Primera instalación:

```bash
cd plc-virtual && npm install && cd ..
cd puente-modbus-planta && npm install && cp .env.example .env && cd ..
cd hmi-planta-3d && npm install && cd ..

./iniciar.sh     # PLC virtual + middleware + HMI 3D; abre http://localhost:5173 (Ctrl+C detiene todo)
```

- Operar sin la vista 3D: `cd puente-modbus-planta && npm run consola` (con la planta en marcha).
- Demostración narrada del PLC y el middleware: `cd puente-modbus-planta && npm run demo` (≈ 10 s).
- Pruebas: `npm test` en `plc-virtual/` (CP-01…CP-19, ≈ 25 s), `puente-modbus-planta/` (≈ 4 s) y `hmi-planta-3d/` (< 1 s).

Detalle en `docs/03_manual_puesta_en_marcha.md`. El árbol ya está creado: `scaffold.sh` solo sirve para generar un repositorio nuevo.

## Windows (laboratorio SILOGE)

Todo lo específico de Windows está en [`windows/`](windows/README.md): montaje en CODESYS, `.env` con el puerto 502 y el registro de lo que cambia respecto a macOS. `node_modules/` no se copia entre sistemas: `npm install` en cada equipo.
