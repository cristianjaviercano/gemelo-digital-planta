# Laboratorio SILOGE · Windows + CODESYS

Guía para ejecutar la planta en los equipos del laboratorio SILOGE (Windows). El proyecto se desarrolla en macOS con el PLC virtual ([`docs/03`](../docs/03_manual_puesta_en_marcha.md)); esta carpeta reúne todo lo que cambia en Windows. Lo que se modificó para macOS y su efecto en el laboratorio está en [`REGISTRO_DE_CAMBIOS.md`](REGISTRO_DE_CAMBIOS.md).

| Archivo | Uso |
|---|---|
| `README.md` | Esta guía |
| `REGISTRO_DE_CAMBIOS.md` | Cambios hechos para macOS, qué hacer en Windows y pendientes del laboratorio |
| `puente-modbus-planta.env` | `.env` del middleware para CODESYS (puerto 502) |
| `scaffold.ps1` | Generador del repositorio desde cero (Fase 1); no hace falta con el árbol ya creado |
| `notas/instrucciones_uno.md` | Nota original de la Fase 2 (histórica; lo vigente es esta guía) |

El programa del PLC está en [`plc-codesys/`](../plc-codesys/), en la raíz del proyecto, porque también es la fuente de verdad que replica `plc-virtual/`.

## 1. Requisitos

- Windows 10/11 x64 con CODESYS V3.5 (SP19 o posterior) y CODESYS Control Win V3 x64.
- Node.js 22 LTS (mínimo 20.19, requerido por Vite 8) y npm ≥ 10.
- Navegador con WebGL 2 (Chrome, Edge o Firefox actualizados).

## 2. Instalación (PowerShell, desde la raíz del proyecto)

Si la carpeta llega desde el Mac, borrar antes cualquier `node_modules\`: contiene binarios de macOS y Vite no arrancaría en Windows.

```powershell
cd plc-virtual; npm install; cd ..
cd puente-modbus-planta; npm install; Copy-Item ..\windows\puente-modbus-planta.env .env; cd ..
cd hmi-planta-3d; npm install; cd ..
```

## 3. Capa de control en CODESYS

### 3.1 Creación del proyecto

1. *Archivo → Nuevo proyecto → Proyecto estándar*. Dispositivo: **CODESYS Control Win V3 x64**; lenguaje de `PLC_PRG`: **Texto estructurado (ST)**.
2. *Configuración de tareas → MainTask*: tipo **Cíclica**, intervalo **T#10MS** (hipótesis H3, `docs/01` §3.7).

### 3.2 Objetos a crear (orden de dependencia)

En CODESYS cada POU tiene dos paneles: **declaración** (superior, desde la cabecera hasta `END_VAR`) e **implementación** (inferior). Las palabras de cierre `END_FUNCTION_BLOCK` / `END_PROGRAM` de los archivos `.st` son delimitadores de referencia y **no** se pegan en el editor.

| # | Objeto | Tipo CODESYS | Origen |
|:-:|---|---|---|
| 1 | `E_EstadoClasificador` | DUT · Enumeración | `plc-codesys/variables_globales.st` [1] |
| 2 | `GVL_IO` | Lista de variables globales | `plc-codesys/variables_globales.st` [2] |
| 3 | `GVL_Param` | Lista de variables globales | `plc-codesys/variables_globales.st` [3] |
| 4 | `FB_Heartbeat` | POU · Bloque de función (ST) | `plc-codesys/logica_clasificador_fsm.st` [1] |
| 5 | `FB_ClasificadorFSM` | POU · Bloque de función (ST) | `plc-codesys/logica_clasificador_fsm.st` [2] |
| 6 | `PLC_PRG` | POU · Programa (ST) — sustituir el existente | `plc-codesys/logica_clasificador_fsm.st` [3] |

### 3.3 Dispositivo esclavo Modbus TCP

1. Clic derecho en *Device* → *Agregar dispositivo* → **Ethernet** (adaptador). Interfaz de red: **127.0.0.1** (*loopback*).
2. Clic derecho en *Ethernet* → *Agregar dispositivo* → **ModbusTCP Slave Device**.
3. Pestaña *General*: puerto **502**, Unit ID **1**, timeout/watchdog **2000 ms**; habilitar **7 Coils** y **7 Discrete Inputs** (contrato v1.1.0). La disponibilidad y nomenclatura exacta de estas áreas depende de la versión del dispositivo instalado; si la versión solo ofrece registros, debe actualizarse el paquete Modbus mediante el *CODESYS Installer* antes de continuar, pues el contrato exige direccionamiento por bit. Si el dispositivo trae activas áreas de *Holding/Input Registers* (suelen ocupar `%IW0`/`%QW0` por defecto), poner su cantidad en 0 o reubicarlas lejos del byte 0: `%IW0` comparte bytes con `%IX0.x`, y los registros sobrescribirían los coils escritos por el maestro.
4. Pestaña *Asignación E/S*: verificar que el área de Coils comienza en **%IX0.0** y la de Discrete Inputs en **%QX0.0** (doble clic sobre la dirección para editarla). Ajustar **Ciclo de bus** a `MainTask`. Activar *Actualizar siempre variables*.
5. La coincidencia de direcciones hace que las declaraciones `AT %IX0.x / %QX0.x` de `GVL_IO` accedan exactamente a los bits intercambiados por Modbus. Alternativamente puede usarse la asignación «mapear a variable existente» sin `AT`; no deben combinarse ambos métodos sobre la misma variable.

Los parámetros de referencia del esclavo están en `plc-codesys/config_modbus_slave.json`.

### 3.4 Compilación y arranque

1. *Compilar → Generar código* (F11): 0 errores, 0 advertencias esperadas.
2. Iniciar **CODESYS Control Win V3 x64** (icono de bandeja → *Start PLC*).
3. *Dispositivo → Escanear red*, seleccionar el runtime local, *Iniciar sesión* (Alt+F8) y *Inicio* (F5).
4. Si el puerto 502 está ocupado o bloqueado: `netstat -ano | findstr :502` y crear regla de entrada TCP 502 en el Firewall de Windows (solo necesaria para acceso desde otro host).

## 4. Pruebas CP-01 … CP-19

La tabla de casos, común a ambas plataformas, está en [`docs/03`](../docs/03_manual_puesta_en_marcha.md) §3.

**Automática (recomendada).** El mismo conjunto de pruebas que se usa en macOS actúa como maestro Modbus TCP contra CODESYS. Con el runtime en marcha y ningún valor forzado:

```powershell
cd plc-virtual
$env:PLC_HOST = "127.0.0.1"; $env:PLC_PORT = "502"
npm test
```

**Manual.** *Preparar valor* + **Forzar valores** (F7) sobre `GVL_IO` y observar `PLC_PRG.fbClasificador.eEstado`. *Escribir valores* (Ctrl+F7) no sirve aquí: las entradas están mapeadas a `%IX` y el esclavo Modbus vuelve a copiar sus coils (FALSE mientras no haya maestro) en cada ciclo de bus, así que un valor escrito dura como mucho un ciclo. Los pulsos de Marcha/Parada se emulan forzando TRUE y luego FALSE. Al terminar, *Liberar forzado* (Alt+F7): un valor forzado taparía las órdenes del middleware en la Fase 3.

## 5. Middleware y HMI 3D (Fases 3 y 4)

Con CODESYS en marcha (§3.4) y el `.env` de esta carpeta copiado (§2), en dos ventanas de PowerShell:

```powershell
cd puente-modbus-planta; npm run dev       # middleware con registro legible
cd hmi-planta-3d; npm run dev              # HMI 3D → abrir http://localhost:5173
```

- `iniciar.sh` de la raíz es solo para macOS; en Windows se usan las dos ventanas anteriores.
- Sin la vista 3D se puede operar con `cd puente-modbus-planta; npm run consola` (m, p, e1/e0, s1/s0, a/b, q).
- Para abrir la HMI desde otro PC del laboratorio: `npm run dev -- --host`, `WS_HOST=0.0.0.0` en el `.env` del middleware y reglas de entrada TCP 5173 y 8080 en el Firewall. La HMI se conecta sola al middleware del equipo que la sirve. Solo una HMI a la vez, porque cada una emula su propio sensor.

- `npm test` y `npm run demo` en `puente-modbus-planta\` también funcionan en Windows: usan el PLC virtual, no CODESYS. La demo sirve para mostrar el sistema en clase antes de conectar el PLC real.
- Para comprobar la vigilancia del heartbeat con el PLC real: *Detener* (Shift+F8) en CODESYS → a los ≈ 1,5 s el middleware debe publicar `SIN_CONEXION_PLC`; *Inicio* (F5) → se recupera.
- Para ver la planta desde otros equipos del laboratorio: `WS_HOST=0.0.0.0` en `.env` y regla de entrada TCP 8080 en el Firewall de Windows. El esclavo Modbus sigue en `127.0.0.1`.

## 6. Windows sin CODESYS

El PLC virtual también funciona en Windows, por ejemplo en un equipo sin licencia o para preparar una clase: `cd plc-virtual; npm start` (escucha en `127.0.0.1:5020`). En ese caso el middleware debe usar `MODBUS_PORT=5020`: copiar `puente-modbus-planta\.env.example` como `.env` en lugar del archivo de esta carpeta.

## 7. Diferencias entre plataformas

| Aspecto | macOS (desarrollo) | Windows (laboratorio SILOGE) |
|---|---|---|
| Capa de control | `plc-virtual/` (`npm start`) | CODESYS Control Win V3 x64 con `plc-codesys/` |
| Puerto Modbus | 5020 | 502 |
| `.env` del middleware | `cp .env.example .env` | `Copy-Item ..\windows\puente-modbus-planta.env .env` |
| Pruebas CP | `npm test` en `plc-virtual/` | `$env:PLC_HOST="127.0.0.1"; $env:PLC_PORT="502"; npm test`, o forzado F7 |
| Arranque de la planta | `./iniciar.sh` (las tres capas) | CODESYS + dos ventanas: middleware y HMI (§5) |
| Middleware | `npm run dev` contra el PLC virtual | `npm run dev` contra CODESYS; `WS_HOST=0.0.0.0` + Firewall si la HMI se abre desde otro PC |
| `node_modules/` | `npm install` en el Mac | `npm install` en cada equipo; nunca copiar desde el Mac |
| Generador del repositorio | `scaffold.sh` | `windows/scaffold.ps1` |
