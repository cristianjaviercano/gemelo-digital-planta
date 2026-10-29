# Registro de cambios · macOS ↔ Windows

El proyecto se desarrolla en macOS y se ejecuta en el laboratorio SILOGE (Windows + CODESYS). Cada entrada indica qué cambió y qué hay que hacer en Windows. Las entradas más recientes van primero.

## 2026-10-23 · Fase 5, primera parte: estibas y estado S5 implementados

- *El contrato Modbus v1.1.0 entra en vigor* (`docs/02` §6). Sustituye la indicación anterior de no configurarlo. En CODESYS:
  1. Volver a cargar `plc-codesys/variables_globales.st` (la enumeración gana `ESPERANDO_CAMBIO_ESTIBA := 5`; `GVL_IO` gana `Estiba_Llena_A AT %IX0.5`, `Estiba_Llena_B AT %IX0.6` y `Senal_Cambio_Estiba AT %QX0.6`) y las tres POU de `plc-codesys/logica_clasificador_fsm.st` (T9, T10 y Q6).
  2. Configurar el esclavo Modbus con *7 coils y 7 discrete inputs* (`windows/README.md` §3.3) y comprobar en *Asignación E/S* que siguen empezando en `%IX0.0` y `%QX0.0`.
  3. Compilar (F11) y ejecutar CP-01…CP-19 (`windows/README.md` §4).
- *Middleware:* contrato v1.1.0 (lectura de 7 bits, FC15 de 7 coils que conserva seta, selector y estibas). La consola admite `la1/la0` y `lb1/lb0` para las estibas. Sin dependencias nuevas.
- *HMI 3D:* estibas de 1,2 × 1,0 m al final de cada salida, colocación animada de los paquetes en patrón de 4 × 4 por capa, capacidad ajustable (1 a 48, 12 por defecto), cambio de estiba de 3 s y baliza ámbar H2. Probado en macOS: 15 pruebas del modelo y verificación de extremo a extremo con un ciclo completo de estiba.
- *PLC virtual:* la tarea de 10 ms se programa ahora sobre la marca ideal k·T_scan; con `setInterval` el periodo medio real era de 11,78 ms. No afecta a CODESYS.
- *Documentación:* `docs/03` incorpora una sección sobre qué es un PLC, cómo se configura y cómo lo emula la aplicación, con las figuras 5 a 7; las figuras 2 a 4 muestran las estibas. Indicadores y CSV de la Fase 5 siguen pendientes (`docs/08`).
- *En Windows:* actualizar el código (`plc-codesys/`, `puente-modbus-planta/`, `hmi-planta-3d/`), seguir los pasos 1 a 3 y `npm install` solo si `node_modules/` no existe.

## 2026-10-23 · Documentación y diseño de la Fase 5

- *Documentación nueva* en `docs/` (índice en `docs/README.md`): modelos BPMN 2.0 (`04`), arquitectura implementada (`05`), manual de operación (`06`), fundamentos teóricos (`07`) y especificación de la Fase 5 (`08`).
- *Fase 5 aprobada, no implementada:* el contrato Modbus v1.1.0 está documentado en `docs/02` §6. *No configurar todavía* 7 coils ni 7 discrete inputs en CODESYS: el laboratorio sigue con la v1.0.0 hasta que este registro anuncie la implementación.
- *Corrección de un comentario* en `plc-codesys/logica_clasificador_fsm.st`: el periodo del heartbeat es 2·(PT + 2·T_scan) = 1040 ms, no 1020 ms. Se verificó simulando el bloque. No cambia el comportamiento; si el programa ya está cargado en CODESYS, no hace falta recargarlo.

## 2026-10-23 · Fase 4: HMI 3D

- **Código nuevo** en `hmi-planta-3d/` (manual en `docs/03` §5). Probado en macOS: 8 pruebas del modelo cinemático y una verificación de extremo a extremo en Chrome contra el PLC virtual (0 paquetes mal clasificados).
- **Geometría definitiva:** $v_c$ 0,6 m/s, $L_d$ 0,65 m, $L_s$ 1,5 m; despeje 3,83 s (A) y 3,75 s (B). **`T#4s` no cambia**: no hay que tocar los `.st` en CODESYS.
- **`iniciar.sh`** en la raíz arranca las tres capas, pero solo en macOS. En Windows: CODESYS + dos ventanas (`windows/README.md` §5).
- **Corrección en el middleware (Fase 3):** detenerlo justo después de una caída del PLC lo dejaba colgado, porque `modbus-serial` no llama al callback de `close()` si el socket ya estaba cerrado. Ahora el cierre tiene un plazo de 500 ms y el proceso sale en ≤ 2 s.
- **En Windows:** `npm install` en `hmi-planta-3d\` y la sección §5 de la guía.

## 2026-10-23 · Fase 3: middleware Modbus → WebSocket

- **Código nuevo** en `puente-modbus-planta/` (manual en `docs/03` §4). Desarrollado y probado en macOS contra el PLC virtual: 15/15 pruebas (8 unitarias, 7 de integración).
- **Variable nueva `WS_HOST`** (por defecto `127.0.0.1`) en `.env.example` y en `windows/puente-modbus-planta.env`. En el laboratorio, `0.0.0.0` si la HMI se abre desde otro PC, más regla de Firewall para TCP 8080. Un `.env` antiguo sin esta variable sigue funcionando.
- **PLC virtual:** órdenes `stop`/`run` en su terminal para emular STOP/RUN de CODESYS y demostrar la vigilancia del heartbeat.
- **En Windows:** `npm install` en `puente-modbus-planta\` y ejecutar el §5 de `windows/README.md`. Nada del código depende del sistema operativo.

## 2026-10-23 · macOS como plataforma de desarrollo

| Cambio | Antes | Ahora | En Windows |
|---|---|---|---|
| Procedimiento CODESYS | `docs/03` §2 | `windows/README.md` §3–4 | Seguir esa guía |
| Protocolo CP-01…CP-14 | `docs/03` §2.5 | `docs/03` §3 (común a ambas plataformas) | Sin cambio |
| Puerto en `puente-modbus-planta/.env.example` | 502 | 5020 | Usar `windows/puente-modbus-planta.env` (502) |
| Puerto por defecto de `npm test` contra un esclavo externo | 502 | 5020 | Definir `$env:PLC_PORT = "502"` |
| `scaffold.ps1` | raíz del proyecto | `windows/` | Mismo uso |
| Nota de la Fase 2 (`instrucciones_uno.md`) | raíz → `docs/notas/` | `windows/notas/` | Solo referencia histórica |
| `docs/01` y `docs/02` | solo CODESYS | Nota sobre el PLC virtual y el puerto 5020 | Sin cambio: CODESYS sigue siendo la arquitectura de referencia |

## 2026-10-22 · Fase 2 en macOS

- **Fusión de entregas.** Los zips de la Fase 1 y la Fase 2 no quedaron combinados: la Fase 2 estaba en una carpeta aparte y suelta fuera del proyecto, mientras `plc-codesys/*.st` seguían vacíos. Se copiaron los dos `.st` y el manual 03 a su lugar (verificados byte a byte); los duplicados se enviaron a la Papelera del Mac.
- **Dos correcciones al procedimiento CODESYS.** Se dedujeron del comportamiento conocido de CODESYS y aún no se han verificado en un runtime real:
  - Las pruebas manuales usan **Forzar** (F7), no *Escribir* (Ctrl+F7): el esclavo Modbus sobrescribe las entradas `%IX` en cada ciclo.
  - Las áreas de registros del esclavo pueden ocupar `%IW0` y solaparse con los coils en `%IX0.x`: ponerlas en 0 o reubicarlas.
- **PLC virtual** (`plc-virtual/`). Traducción 1:1 de `plc-codesys/` a Node.js con el mismo esclavo Modbus (coils 0–4, DI 0–5, Unit ID 1), más el protocolo CP-01…CP-14 automatizado como maestro Modbus. Resultado en macOS: 19/19 pruebas, en proceso y como proceso independiente.
- **Puerto 5020 en macOS.** macOS solo permite puertos < 1024 sin privilegios escuchando en todas las interfaces, lo que expondría el PLC a la red. Con 5020 se mantiene `127.0.0.1`; el mapa de memoria no cambia.
- **Dependencias** instaladas en macOS: los `node_modules/` contienen binarios `darwin-arm64` y no sirven en Windows.

## Pendiente en el laboratorio

- [ ] Montar `plc-codesys/` en CODESYS y compilar con 0 errores (`windows/README.md` §3).
- [ ] Ejecutar CP-01…CP-19 contra CODESYS (§4) y anotar aquí el resultado.
- [ ] Confirmar o corregir las dos correcciones del 2026-10-22.
- [ ] Middleware contra CODESYS (`windows/README.md` §5): operar con la consola y comprobar que STOP (Shift+F8) produce `SIN_CONEXION_PLC` a los ≈ 1,5 s.
- [ ] HMI 3D contra CODESYS: clasificar varios paquetes por A y B con alimentación automática; el contador «Mal clasif.» debe quedar en 0.
- [ ] Estibas contra CODESYS: con capacidad 2, llenar una estiba y comprobar `ESPERANDO_CAMBIO_ESTIBA` con las cintas paradas y la baliza ámbar; cambiarla y verificar que la línea vuelve a Reposo y solo arranca con Marcha.
- [ ] Rendimiento de la HMI en los PC del laboratorio: la planta debe moverse con fluidez; la sincronía con el PLC exige al menos 1 fotograma por segundo.
- [ ] Si un cambio en los `.st` resulta necesario, replicarlo en `plc-virtual/src/clasificador.js` y volver a pasar `npm test` en ambas plataformas.
