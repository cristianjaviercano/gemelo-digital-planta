# 02 · Mapeo de memoria Modbus y contrato de datos

**Proyecto:** Planta Virtual de Clasificación Gobernada por PLC · **Fase:** 1 · **Versión del contrato:** 1.1.0 (la 1.0.0 de §2–§4, ampliada en §6)

---

## 1. Fundamento

Se establece una relación biunívoca entre tres representaciones de una misma variable de proceso: (i) la dirección directamente representada del PLC según IEC 61131-3 (International Electrotechnical Commission [IEC], 2013), (ii) el objeto del modelo de datos Modbus (Modbus Organization, 2012) y (iii) la propiedad del objeto JSON transportado por WebSocket (Fette & Melnikov, 2011). El mapa es **inmutable**: cualquier fase posterior puede ampliar el contrato únicamente añadiendo campos opcionales, nunca reasignando direcciones.

## 2. Parámetros del esclavo Modbus TCP

| Parámetro | Valor | Observación |
|---|---|---|
| Dispositivo CODESYS | `Ethernet` → `ModbusTCP Slave Device` | Árbol de dispositivos del proyecto |
| Dirección IP de enlace | `127.0.0.1` | *Loopback*; sin exposición a red externa |
| Puerto TCP | `502` | CODESYS (laboratorio, Windows): habilitar excepción en el Firewall de Windows si se accede desde otro host. En macOS, el PLC virtual usa `5020` (`MODBUS_PORT`; ver `03_manual_puesta_en_marcha.md` §2) |
| Unit ID | `1` | Parametrizable en `.env` (`MODBUS_UNIT_ID`) |
| Timeout | `2000 ms` | Watchdog de conexión del esclavo y `setTimeout()` del cliente |
| Coils (escritura maestro → PLC) | 5 bits, dirección base 0 | Mapeados a `%IX0.0 … %IX0.4` |
| Discrete Inputs (lectura PLC → maestro) | 6 bits, dirección base 0 | Mapeados a `%QX0.0 … %QX0.5` |
| Tarea de bus | `MainTask`, cíclica 10 ms | Actualización de la imagen de proceso |

**Convención de orientación.** En el esclavo de CODESYS, las *coils* y *holding registers* son **entradas** del PLC (las escribe el maestro), mientras que los *discrete inputs* e *input registers* son **salidas** del PLC (las lee el maestro). Por ello las salidas `%QX` se leen con **FC02** y FC01 se reserva para la **lectura de retorno** (*readback*) de las órdenes escritas, lo que permite publicar en el JSON el valor de entrada efectivamente presente en el PLC y no el último valor solicitado por la HMI.

## 3. Tabla de direccionamiento

### 3.1 Entradas del PLC (`%IX`) — Coils

| Dirección IEC | Byte.bit | Coil (0-based) | Ref. 1-based | Variable PLC | Tipo | Escritura | Lectura | Campo JSON (`inputs.*`) | Semántica |
|---|---|:-:|:-:|---|---|---|---|---|---|
| `%IX0.0` | 0.0 | 0 | 00001 | `Marcha` | `BOOL` | FC05 (pulso) | FC01 | `marcha` | Pulsador NA momentáneo, ancho 150 ms |
| `%IX0.1` | 0.1 | 1 | 00002 | `Parada` | `BOOL` | FC05 (pulso) | FC01 | `parada` | Pulsador momentáneo; prioridad sobre Marcha |
| `%IX0.2` | 0.2 | 2 | 00003 | `Emergencia` | `BOOL` | FC05 (nivel) | FC01 | `emergencia` | `TRUE` = emergencia activa (seta enclavada) |
| `%IX0.3` | 0.3 | 3 | 00004 | `Sensor_Entrada` | `BOOL` | FC05 (nivel) | FC01 | `sensorEntrada` | Presencia emulada por la escena 3D |
| `%IX0.4` | 0.4 | 4 | 00005 | `Selector_Destino` | `BOOL` | FC05 (nivel) | FC01 | `selectorDestinoB` | `FALSE` = Ruta A · `TRUE` = Ruta B |

FC15 (*Write Multiple Coils*, dirección 0, cantidad 5) se reserva para la **inicialización segura** tras cada (re)conexión: `[0, 0, e_HMI, 0, d_HMI]`, donde se preservan el estado de la seta y del selector del panel y se fuerzan a 0 los pulsadores y el sensor.

### 3.2 Salidas del PLC (`%QX`) — Discrete Inputs

| Dirección IEC | Byte.bit | Discrete Input (0-based) | Ref. 1-based | Variable PLC | Tipo | Lectura | Campo JSON | Semántica |
|---|---|:-:|:-:|---|---|---|---|---|
| `%QX0.0` | 0.0 | 0 | 10001 | `Motor_Cinta_Entrada` | `BOOL` | FC02 | `outputs.cintaEntrada` | Cinta de entrada energizada |
| `%QX0.1` | 0.1 | 1 | 10002 | `Actuador_Desviador` | `BOOL` | FC02 | `outputs.desviadorActivo` | `TRUE` = paleta en posición Ruta B |
| `%QX0.2` | 0.2 | 2 | 10003 | `Motor_Cinta_Salida_A` | `BOOL` | FC02 | `outputs.cintaSalidaA` | Cinta de salida A energizada |
| `%QX0.3` | 0.3 | 3 | 10004 | `Motor_Cinta_Salida_B` | `BOOL` | FC02 | `outputs.cintaSalidaB` | Cinta de salida B energizada |
| `%QX0.4` | 0.4 | 4 | 10005 | `Baliza_Alarma` | `BOOL` | FC02 | `outputs.balizaAlarma` | Señalización de emergencia |
| `%QX0.5` | 0.5 | 5 | 10006 | `Heartbeat_Out` | `BOOL` | FC02 | `heartbeat` (raíz) | Onda cuadrada, $T_h$ = 1 s (`Heartbeat_Timer`, PT = T#500ms) |

### 3.3 Resumen de códigos de función

| FC | Nombre (Modbus Organization, 2012) | Dirección de flujo | Uso en el sistema | Periodicidad |
|:-:|---|---|---|---|
| 01 | Read Coils | PLC → MW | *Readback* de `%IX0.0–0.6` → `inputs` | Cíclica, 50 ms |
| 02 | Read Discrete Inputs | PLC → MW | Lectura de `%QX0.0–0.6` → `outputs`, `heartbeat` | Cíclica, 50 ms |
| 05 | Write Single Coil | MW → PLC | Orden individual del operador o del sensor emulado | Por evento |
| 15 | Write Multiple Coils | MW → PLC | Inicialización segura tras (re)conexión | Por evento |

### 3.4 Transformación de bits (decodificación)

Sea $\mathbf{c} = (c_0,\dots,c_4)$ la respuesta FC01 y $\mathbf{q} = (q_0,\dots,q_5)$ la respuesta FC02 (`modbus-serial` devuelve `data: boolean[]`, con relleno hasta múltiplo de 8 que se descarta). La función de decodificación es:

$$
\text{decode}(\mathbf{c},\mathbf{q}) = \{\ \text{inputs} = \phi_I(\mathbf{c}),\ \text{outputs} = \phi_O(q_0..q_4),\ \text{heartbeat} = q_5,\ \text{systemStatus} = \lambda^{-1}(q_0..q_4)\ \}
$$

con $\lambda^{-1}$ definida por la tabla de salidas de `01_arquitectura_y_flujos.md` §3.4:

| $(q_0,q_1,q_2,q_3,q_4)$ | `systemStatus` |
|---|---|
| `0 0 0 0 0` | `REPOSO` |
| `1 0 0 0 0` | `ESPERANDO_PAQUETE` |
| `1 0 1 0 0` | `CLASIFICANDO_RUTA_A` |
| `1 1 0 1 0` | `CLASIFICANDO_RUTA_B` |
| `0 0 0 0 1` | `PARADA_EMERGENCIA` |
| conexión caída o heartbeat congelado > 1500 ms | `SIN_CONEXION_PLC` |
| cualquier otra palabra | `ESTADO_INDETERMINADO` |

## 4. Contrato JSON (WebSocket)

### 4.1 Mensaje de estado (servidor → clientes) — estructura inmutable

Emitido por difusión en cada ciclo de adquisición ($T_p$ = 50 ms) y congelado con `Object.freeze` en `dataContract.js`.

```json
{
  "timestamp": 1792684800000,
  "plcConnected": true,
  "heartbeat": true,
  "inputs": {
    "marcha": false,
    "parada": false,
    "emergencia": false,
    "sensorEntrada": false,
    "selectorDestinoB": false
  },
  "outputs": {
    "cintaEntrada": false,
    "desviadorActivo": false,
    "cintaSalidaA": false,
    "cintaSalidaB": false,
    "balizaAlarma": false
  },
  "systemStatus": "ESPERANDO_PAQUETE"
}
```

**Regla de degradación segura:** si `plcConnected = false`, el servidor publica todos los campos de `outputs` en `false` y `systemStatus = "SIN_CONEXION_PLC"`; la escena 3D detiene toda cinemática (estado seguro por defecto).

### 4.2 Esquema formal (JSON Schema 2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:planta-clasificacion:estado:1.0.0",
  "title": "EstadoPlanta",
  "type": "object",
  "additionalProperties": false,
  "required": ["timestamp", "plcConnected", "heartbeat", "inputs", "outputs", "systemStatus"],
  "properties": {
    "timestamp":    { "type": "integer", "minimum": 0, "description": "Época Unix en ms (Date.now() del middleware)" },
    "plcConnected": { "type": "boolean" },
    "heartbeat":    { "type": "boolean", "description": "%QX0.5 Heartbeat_Out" },
    "inputs": {
      "type": "object",
      "additionalProperties": false,
      "required": ["marcha", "parada", "emergencia", "sensorEntrada", "selectorDestinoB"],
      "properties": {
        "marcha":           { "type": "boolean", "description": "%IX0.0 · Coil 0" },
        "parada":           { "type": "boolean", "description": "%IX0.1 · Coil 1" },
        "emergencia":       { "type": "boolean", "description": "%IX0.2 · Coil 2" },
        "sensorEntrada":    { "type": "boolean", "description": "%IX0.3 · Coil 3" },
        "selectorDestinoB": { "type": "boolean", "description": "%IX0.4 · Coil 4" }
      }
    },
    "outputs": {
      "type": "object",
      "additionalProperties": false,
      "required": ["cintaEntrada", "desviadorActivo", "cintaSalidaA", "cintaSalidaB", "balizaAlarma"],
      "properties": {
        "cintaEntrada":    { "type": "boolean", "description": "%QX0.0 · DI 0" },
        "desviadorActivo": { "type": "boolean", "description": "%QX0.1 · DI 1" },
        "cintaSalidaA":    { "type": "boolean", "description": "%QX0.2 · DI 2" },
        "cintaSalidaB":    { "type": "boolean", "description": "%QX0.3 · DI 3" },
        "balizaAlarma":    { "type": "boolean", "description": "%QX0.4 · DI 4" }
      }
    },
    "systemStatus": {
      "type": "string",
      "enum": ["REPOSO", "ESPERANDO_PAQUETE", "CLASIFICANDO_RUTA_A", "CLASIFICANDO_RUTA_B",
               "PARADA_EMERGENCIA", "SIN_CONEXION_PLC", "ESTADO_INDETERMINADO"]
    }
  }
}
```

### 4.3 Mensaje de comando (cliente → servidor)

Canal ascendente complementario; no modifica el mensaje de estado. La lista blanca de `target` coincide exactamente con las cinco *coils* del mapa.

```json
{ "type": "command", "target": "marcha", "action": "pulse" }
{ "type": "command", "target": "emergencia", "action": "set", "value": true }
```

| `target` | Coil | `action` admitida | Comportamiento en el middleware |
|---|:-:|---|---|
| `marcha` | 0 | `pulse` | FC05 ON → espera `PULSE_WIDTH_MS` (150) → FC05 OFF |
| `parada` | 1 | `pulse` | Ídem |
| `emergencia` | 2 | `set` | FC05 con `value` (nivel enclavado) |
| `sensorEntrada` | 3 | `set` | FC05 con `value`; lo emite la escena al entrar/salir del volumen del sensor |
| `selectorDestinoB` | 4 | `set` | FC05 con `value` |

Respuesta: `{ "type": "ack", "target": "<target>", "ok": true | false, "error"?: "<código>" }`. Todo mensaje que no satisfaga la lista blanca se rechaza con `ok: false` y se registra a nivel `warn`.

## 5. Restricciones temporales del contrato

| Parámetro | Símbolo | Valor | Justificación |
|---|---|---|---|
| Ciclo de tarea PLC | $T_{scan}$ | 10 ms | Resolución de flancos y TON |
| Periodo de *polling* | $T_p$ | 50 ms | Especificación; 20 muestras por periodo de heartbeat |
| Ancho de pulso de mando | $T_{pulse}$ | 150 ms | $> T_{scan} + T_p$: garantiza observación del flanco y su *readback* |
| Detección de PLC no vivo | $T_{stale}$ | 1500 ms | $3 \cdot PT$ del `Heartbeat_Timer` |
| Timeout de transacción | $T_{out}$ | 2000 ms | Especificación |
| Reconexión | $T_{rc}(n)$ | $\min(500 \cdot 2^{n},\ 5000)$ ms | Retroceso exponencial acotado |

---

## Referencias

Fette, I., & Melnikov, A. (2011). *The WebSocket protocol* (RFC 6455). Internet Engineering Task Force. https://doi.org/10.17487/RFC6455

International Electrotechnical Commission. (2013). *Programmable controllers — Part 3: Programming languages* (IEC Standard No. 61131-3:2013).

Modbus Organization. (2006). *MODBUS messaging on TCP/IP implementation guide V1.0b*. https://modbus.org/specs.php

Modbus Organization. (2012). *MODBUS application protocol specification V1.1b3*. https://modbus.org/specs.php

JSON Schema. (2020). *JSON Schema: Draft 2020-12*. https://json-schema.org/draft/2020-12

---

## 6. Ampliación v1.1.0 (Fase 5)

> *Estado:* aprobada e implementada el 2026-10-23 en `plc-codesys/`, `plc-virtual/`, `puente-modbus-planta/` y `hmi-planta-3d/`; verificada con CP-15 a CP-19 y con las pruebas del middleware. El laboratorio la configura según la entrada de la Fase 5 en `windows/REGISTRO_DE_CAMBIOS.md`.

La ampliación añade dos entradas y una salida para las estibas de salida, sin reasignar ninguna dirección existente (§1). La justificación y la lógica del estado nuevo están en `08_especificacion_fase5.md` §3.

| Dirección IEC | Modbus (0-based) | Ref. 1-based | Variable PLC | Escritura / lectura | Campo JSON | Semántica |
|---|:-:|:-:|---|---|---|---|
| `%IX0.5` | Coil 5 | 00006 | `Estiba_Llena_A` | FC05 (nivel) / FC01 | `inputs.estibaLlenaA` | Estiba A no disponible: llena o en cambio |
| `%IX0.6` | Coil 6 | 00007 | `Estiba_Llena_B` | FC05 (nivel) / FC01 | `inputs.estibaLlenaB` | Estiba B no disponible |
| `%QX0.6` | Discrete Input 6 | 10007 | `Senal_Cambio_Estiba` | FC02 | `outputs.senalCambioEstiba` | Baliza ámbar: esperando cambio de estiba |

Cambios derivados:

| Elemento | v1.0.0 | v1.1.0 |
|---|---|---|
| Esclavo Modbus | 5 coils, 6 discrete inputs | 7 coils, 7 discrete inputs |
| FC01 / FC02 | 5 / 6 bits | 7 / 7 bits |
| FC15 de inicialización segura | `[0, 0, e, 0, d]` | `[0, 0, e, 0, d, ℓA, ℓB]` |
| $\lambda^{-1}$ | 5 bits $(q_0 \dots q_4)$ | 6 bits $(q_0 \dots q_4, q_6)$; `000001` → `ESPERANDO_CAMBIO_ESTIBA` |
| `systemStatus` | 7 valores | 8 valores (`ESPERANDO_CAMBIO_ESTIBA`) |
| Lista blanca de comandos | 5 destinos | 7 destinos (`estibaLlenaA`, `estibaLlenaB`, acción `set`) |
