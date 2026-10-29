
Con los archivos ya en la carpeta, el siguiente paso es preparar el entorno y validar el PLC en CODESYS. El middleware y la HMI aún no tienen código (Fases 3 y 4), así que todavía no se ejecuta `npm start` ni `npm run dev`.

**1. Verificar la estructura**

- Si `planta-clasificacion-gemelo-digital-fase1.zip` y `fase2-codesys.zip` se descomprimieron en el mismo lugar, deben haber quedado combinados en una sola carpeta `planta-clasificacion-gemelo-digital\`.
- `plc-codesys\variables_globales.st` y `plc-codesys\logica_clasificador_fsm.st` deben tener contenido; en la Fase 1 estaban vacíos.

**2. Instalar dependencias (Windows)**

- Instalar Node.js 22 LTS y comprobar con `node -v`.
- En PowerShell, desde la carpeta raíz:
  ```powershell
  cd puente-modbus-planta
  npm install
  copy .env.example .env
  cd ..\hmi-planta-3d
  npm install
  ```
- No hace falta ejecutar `scaffold.ps1`: el árbol y los `package.json` ya están creados.

**3. Montar el PLC en CODESYS** (sección 2 de `03_manual_puesta_en_marcha.md`)

1. Crear un proyecto estándar con *CODESYS Control Win V3 x64* y la `MainTask` cíclica a `T#10MS`.
2. Crear los 6 objetos en este orden: `E_EstadoClasificador`, `GVL_IO`, `GVL_Param`, `FB_Heartbeat`, `FB_ClasificadorFSM` y `PLC_PRG`. El texto se pega desde los archivos `.st`, separando declaración e implementación.
3. Añadir *Ethernet* (127.0.0.1) y, debajo, el *ModbusTCP Slave Device*: puerto 502, Unit ID 1, 5 Coils y 6 Discrete Inputs.
4. En *Asignación E/S*, comprobar que los Coils empiezan en `%IX0.0` y los Discrete Inputs en `%QX0.0`.
5. Compilar (F11), arrancar el runtime, iniciar sesión (Alt+F8) y ejecutar (F5).

**4. Ejecutar las pruebas CP-01 a CP-14**

- Usar *Preparar valor* y luego Ctrl+F7 sobre `GVL_IO`, observando `fbClasificador.eEstado`.

**Qué reportar al terminar**

- Si todos los casos pasan, se avanza a la Fase 3.
- Si algo falla, enviar el texto del error o una captura de pantalla. Lo más probable es que ocurra al compilar o en la configuración del esclavo Modbus.
