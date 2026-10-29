# 04 · Modelo de procesos BPMN 2.0

*Proyecto:* Planta Virtual de Clasificación Gobernada por PLC · *Versión:* 1.0.0 · *Fecha:* 2026-10-23

---

## 1. Propósito

El documento presenta los procesos de la planta en notación BPMN 2.0, *Business Process Model and Notation,* de la Object Management Group (OMG, 2011). Sustituye la representación aproximada en Mermaid de `01_arquitectura_y_flujos.md` §4 por modelos en el formato XML estándar, con diagrama, que pueden abrirse y editarse en Camunda Modeler, Bizagi o bpmn.io.

Se modelan dos procesos:

| # | Proceso | Estado |
|:-:|---|---|
| 1 | Clasificación de un paquete gobernada por PLC | Implementado (Fases 2–4) |
| 2 | Corrida de medición y cambio de estiba | Fase 5 (`08_especificacion_fase5.md`): estibas, parada y cambio implementados; corrida e indicadores pendientes |

## 2. Convenciones

- *Un solo pool con cuatro carriles:* todo el proceso ocurre dentro de un mismo sistema. Los carriles separan responsabilidades: Operador, HMI 3D (planta emulada), Middleware Modbus–WebSocket y PLC (máquina de estados de clasificación).
- *Tipos de tarea:*
  - *Tarea de usuario:* acción del operador.
  - *Tarea de servicio:* procesamiento automático.
  - *Tarea de envío:* mensaje hacia otra capa (comando WebSocket o señal emulada).
  - *Almacén de datos:* registro de eventos de la Fase 5.
- *Compuertas exclusivas:* representan las guardas de las transiciones del PLC y las decisiones de la HMI y del middleware. Cada salida lleva la condición que la activa.
- *Bucles:* el control de la planta es cíclico. El PLC evalúa sus transiciones cada 10 ms y el middleware lee cada 50 ms. Los modelos representan esa repetición con flujos de retorno: cada recorrido del bucle corresponde a un evento significativo (una orden del operador o una señal de la planta), no a un ciclo de scan individual. Es una abstracción deliberada. El comportamiento temporal exacto está en `01` §3 y §6.

## 3. Archivos

Cada modelo vive en su carpeta dentro de `docs/bpmn/`:

| Archivo | Uso |
|---|---|
| `proceso.json` | Fuente editable: actores, pasos y conexiones |
| `proceso.bpmn` | XML BPMN 2.0 con diagrama (`BPMNDiagram`), importable en Camunda Modeler, Bizagi o bpmn.io |
| `visor_bpmn.html` | Visor interactivo en el navegador, con zoom y descarga del XML. Carga bpmn-js desde Internet |
| `diagrama_bpmn.md` | Versión en Mermaid con carriles, legible en GitHub o VS Code |

Los modelos se generaron con el Agente 18 del ecosistema SILOGE (`/bpmn`). Para regenerarlos tras editar un `proceso.json`:

```bash
/Users/cristianjaviercanomogollon/Documents/Proyectosv2.0/2_Operativos/01_Agentes_Crc/.venv/bin/python \
  /Users/cristianjaviercanomogollon/Documents/Proyectosv2.0/2_Operativos/01_Agentes_Crc/18_agente_bpmn_modeler/bpmn_modeler.py \
  generar --input docs/bpmn/01_clasificacion_paquete/proceso.json --out-dir docs/bpmn/01_clasificacion_paquete
```

## 4. Proceso 1: clasificación de un paquete

`docs/bpmn/01_clasificacion_paquete/` · 4 carriles, 26 nodos, 31 flujos.

### 4.1 Descripción

El proceso parte de la planta en Reposo. El operador elige el destino y pulsa Marcha. La HMI envía la orden por WebSocket, el middleware la valida contra la lista blanca y la escribe en un coil, y el PLC la lee en su ciclo de scan. Allí, tres compuertas reproducen la prioridad de la máquina de estados: primero la emergencia, después el flanco del sensor y, si lo hay, el destino muestreado. Cualquiera de los estados resultantes (S1 a S4) termina escribiendo las salidas y el heartbeat.

El middleware lee esas salidas cada 50 ms y comprueba si el PLC está vivo. Si no lo está, degrada el estado y reintenta la conexión. Si lo está, la HMI mueve la planta según las salidas y, según el estado publicado, se abren tres caminos:

- *Esperando paquete:* el operador genera un paquete; al cortar el haz, la HMI emite el sensor y el ciclo vuelve al PLC.
- *Clasificando:* la paleta desvía el paquete según su posición física y se comprueba si la ruta coincide con el destino muestreado. El proceso termina con el paquete despachado o, si no coincide, en el evento de error «Paquete mal clasificado».
- *Emergencia:* el operador libera la seta y rearma con Parada, y la orden vuelve al PLC.

### 4.2 Trazabilidad

| Elemento del modelo | Carril | Corresponde a |
|---|---|---|
| Validar en lista blanca y escribir coil (FC05) | Middleware | `validarComando()` y `ClienteModbus.escribirCoil()` / `pulso()` |
| Leer %IX y evaluar δ | PLC | Ciclo de `MainTask`; `FB_ClasificadorFSM` pasos (a)–(c) |
| ¿Emergencia activa? → S4 | PLC | Transición T1 (prioridad máxima) |
| ¿Flanco del sensor en S1? / S1 | PLC | T2 y T6 (S1); el flanco $s^{\uparrow}$ habilita T4 o T5 |
| ¿Destino d muestreado? → S2 / S3 | PLC | T4 ($d = 0$) y T5 ($d = 1$); propiedad P5 |
| Escribir %QX (λ) y heartbeat | PLC | Paso (d) de `FB_ClasificadorFSM` y `FB_Heartbeat` |
| Leer FC01 y FC02 cada 50 ms y difundir estado | Middleware | Lectura reprogramada de `ClienteModbus` y `construirEstado()` |
| ¿PLC vivo? / Degradación segura y reconexión | Middleware | Vigilancia del heartbeat en `index.js`; FC15 en `ClienteModbus` |
| Mover cintas, paleta y baliza según %QX | HMI | Ciclo por fotograma de `main.js` |
| Detectar paquete en el haz (AABB) | HMI | `ModeloPlanta.paso()` y `HAZ_SENSOR` |
| Desviar según la posición física de la paleta | HMI | Decisión de ruta en `ModeloPlanta` (`07` §8.5) |
| Liberar la seta y pulsar Parada | Operador | T8 y propiedad P4 |

## 5. Proceso 2: corrida de medición y cambio de estiba (Fase 5)

`docs/bpmn/02_corrida_y_estibas/` · 4 carriles, 20 nodos, 21 flujos. *Implementado en parte (2026-10-23):* depósito por capas, señal de estiba no disponible, parada en S5, cambio de estiba y rearme con Marcha. La corrida, el registro de eventos y los indicadores siguen pendientes.

### 5.1 Descripción

El operador inicia una corrida y elige los indicadores que desea seguir; la HMI abre el registro de eventos. Por cada paquete depositado en su estiba, la HMI registra el evento, recalcula los indicadores y comprueba si la estiba alcanzó su capacidad.

Si la estiba está llena, la HMI emite la señal de estiba no disponible. El middleware la escribe en su coil y el PLC pasa a S5 (T9): detiene las cintas y enciende la señal ámbar Q6. Después se cumplen cuatro pasos:

1. El middleware difunde el estado `ESPERANDO_CAMBIO_ESTIBA`.
2. El operador retira la estiba llena y coloca una vacía.
3. La HMI libera la señal y cuenta la estiba completada.
4. El PLC vuelve a Reposo (T10), con Marcha bloqueada mientras quede alguna estiba llena.

Tras pulsar Marcha, el PLC vuelve a S1. En cada paquete el operador decide si continúa la corrida o la finaliza. Al finalizar, la HMI genera los CSV de indicadores, paquetes y eventos, y el operador los descarga.

### 5.2 Trazabilidad

| Elemento del modelo | Corresponde a (`08`) |
|---|---|
| Abrir registro de eventos de la corrida | Almacén IndexedDB, §5 |
| Depositar paquete en la estiba (patrón por capas) | Patrón 4 × 4 por capa, §2.1 |
| Registrar evento y recalcular KPIs | Catálogo y motor de indicadores, §4 |
| ¿Estiba en su capacidad? / Emitir estibaLlena | Señal de estiba no disponible, §2.2; coils 5 y 6, §3.2 |
| S5 · Esperando cambio de estiba (T9) | Estado nuevo y propiedad P6, §3.1 |
| Retirar estiba llena y colocar una vacía | Cambio de estiba de 3 s, §2.3 |
| S0 · Reposo (T10) y Pulsar Marcha | Propiedad P7, §3.1 |
| Generar CSV y descargar | Informe orientado a Python, §7 |

---

## Referencias

Object Management Group. (2011). *Business Process Model and Notation (BPMN), version 2.0* (formal/2011-01-03). https://www.omg.org/spec/BPMN/2.0
