
# 01 · Arquitectura, modelo de control y flujos de datos

**Proyecto:** Planta Virtual de Clasificación Gobernada por PLC (*Virtual Commissioning*)
**Fase:** 1 — Ingeniería de detalle · **Versión:** 0.1.0 · **Fecha:** 2026-10-22

---

## 1. Propósito y alcance

El presente documento formaliza la arquitectura del sistema, el modelo matemático del controlador de clasificación y los flujos de información entre sus tres capas. Se adopta el paradigma de puesta en marcha virtual (*virtual commissioning*), en el cual un controlador real —aquí, un PLC virtual conforme a IEC 61131-3 (International Electrotechnical Commission [IEC], 2013)— gobierna un modelo de planta simulado en lugar del equipo físico. La jerarquía funcional se alinea con los niveles 0–2 del modelo ISA-95 (International Society of Automation [ISA], 2010): el gemelo 3D emula el nivel 0–1 (proceso, sensores y actuadores), el PLC constituye el nivel 1–2 (control) y el middleware actúa como pasarela de integración hacia la supervisión (HMI/SCADA).

## 2. Arquitectura de tres capas

| Capa                 | Componente               | Responsabilidad                                                               | Tecnología                                           | Interfaz                                    |
| -------------------- | ------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| C1 · Control (OT)   | PLC virtual              | Única fuente de decisión lógica: FSM, enclavamientos, heartbeat            | CODESYS V3.5 + Control Win V3 x64, ST                 | Esclavo Modbus TCP `127.0.0.1:502`        |
| C2 · Middleware     | `puente-modbus-planta` | Adquisición cíclica, escritura por evento, serialización JSON, reconexión | Node.js ≥ 20.19, `modbus-serial`, `ws`, `pino` | Cliente Modbus TCP ↔ servidor WS `:8080` |
| C3 · Visualización | `hmi-planta-3d`        | Emulación cinemática reactiva, emulación de sensores, mando del operador   | Vite, Three.js, Tailwind CSS                          | Cliente WebSocket (RFC 6455)                |

**Principio de desacoplamiento.** La capa C3 se modela como *planta + HMI*: (i) traduce estados de actuadores (`%QX`) en movimiento, y (ii) emula sensores a partir de la geometría (p. ej., el paquete intersecta el volumen del sensor óptico → `Sensor_Entrada = 1`). En ningún caso C3 decide transiciones de proceso. C2 es semánticamente transparente: no contiene lógica de control, solo codificación, transporte y diagnóstico de comunicaciones.

```mermaid
flowchart LR
  subgraph C3["C3 · HMI/SCADA 3D (navegador)"]
    OP["Panel de operador<br/>Marcha · Parada · Emergencia · Selector"]
    SN["Emulador de sensor óptico<br/>(intersección AABB)"]
    K3["Motor cinemático<br/>cintas · desviador · baliza"]
    WSC["wsClient.js"]
  end
  subgraph C2["C2 · Middleware Node.js"]
    WSS["websocketServer.js<br/>:8080"]
    DC["dataContract.js<br/>validación + λ⁻¹"]
    MBC["modbusClient.js<br/>polling 50 ms · cola de escritura"]
  end
  subgraph C1["C1 · CODESYS Control Win V3"]
    SLV["Modbus_TCP_Slave<br/>127.0.0.1:502"]
    FSM["FSM clasificador (ST)"]
    HB["Heartbeat_Timer<br/>PT = 500 ms"]
  end
  OP -- comando --> WSC
  SN -- flanco sensor --> WSC
  WSC <-->|"JSON / WS"| WSS
  WSS <--> DC <--> MBC
  MBC -- "FC05/FC15 → Coils" --> SLV
  SLV -- "FC01 Coils · FC02 Discrete Inputs" --> MBC
  SLV <--> FSM
  HB --> SLV
  WSC -- estado --> K3
```

## 3. Modelo matemático del controlador

### 3.1 Definición formal

El clasificador se modela como una máquina de Moore (Moore, 1956), extensión transductora del autómata finito $M = (S, \Sigma, \delta, s_0, F)$ (Hopcroft et al., 2006):

$$
M = (S,\ \Sigma,\ \Lambda,\ \delta,\ \lambda,\ s_0,\ F)
$$

| Elemento    | Definición                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| $S$       | $\{S_0{:}\ \text{Reposo},\ S_1{:}\ \text{En\_Marcha\_Espera},\ S_2{:}\ \text{Clasificando\_Ruta\_A},\ S_3{:}\ \text{Clasificando\_Ruta\_B},\ S_4{:}\ \text{Parada\_Emergencia}\}$ |
| $\Sigma$  | $\mathbb{B}^6$, vector de entrada por ciclo de *scan* $k$: $\sigma_k = (m^{\uparrow}, p, e, s^{\uparrow}, d, t)$                                                            |
| $\Lambda$ | $\mathbb{B}^5$, vector de salida $(Q_0,\dots,Q_4)$; $Q_5$ (heartbeat) es ortogonal a la FSM                                                                                   |
| $\delta$  | $S \times \Sigma \to S$, función de transición (§3.3)                                                                                                                          |
| $\lambda$ | $S \to \Lambda$, función de salida de Moore (§3.4)                                                                                                                              |
| $s_0$     | $S_0$ (Reposo), estado tras arranque en frío/caliente del runtime                                                                                                                |
| $F$       | $\{S_0\}$, conjunto de estados seguros de referencia: todo actuador desenergizado y sin alarma                                                                                    |

### 3.2 Variables de entrada y operadores

| Símbolo | Origen                      | Semántica                                                                                                     |
| -------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| $m$    | `%IX0.0` Marcha           | Pulsador momentáneo; se emplea su flanco $m^{\uparrow}$                                                     |
| $p$    | `%IX0.1` Parada           | Pulsador momentáneo; prioridad sobre Marcha                                                                   |
| $e$    | `%IX0.2` Emergencia       | Nivel enclavado; **$e = 1 \Leftrightarrow$ emergencia activa** (lógica positiva en el modelo virtual) |
| $s$    | `%IX0.3` Sensor_Entrada   | Nivel de presencia emulado por C3; se emplea $s^{\uparrow}$                                                  |
| $d$    | `%IX0.4` Selector_Destino | $0 \to$ Ruta A, $1 \to$ Ruta B; se muestrea en el instante de $s^{\uparrow}$                             |
| $t$    | interno                     | Salida de `TON_Clasif` con $IN = y_2 \lor y_3$, $PT = T_{clas}$                                          |

Detección de flanco ascendente (bloque estándar `R_TRIG`, IEC, 2013):

$$
x^{\uparrow}(k) = x(k) \land \lnot x(k-1)
$$

El tiempo de clasificación se dimensiona como tiempo de despeje del paquete desde el sensor hasta el extremo de la cinta de salida:

$$
T_{clas} \geq \frac{L_d + L_s}{v_c} + \varepsilon, \qquad \text{p. ej. } \frac{0.6 + 1.6\ \text{m}}{0.6\ \text{m/s}} + 0.33\ \text{s} \approx 4\ \text{s} \Rightarrow T_{clas} := \texttt{T\#4s}
$$

donde $L_d$ es la longitud de la zona de desvío, $L_s$ la de la cinta de salida, $v_c$ la velocidad lineal nominal de las cintas y $\varepsilon$ un margen. Los valores geométricos definitivos se fijarán en la Fase 4 y retroalimentarán el parámetro del PLC.

### 3.3 Función de transición $\delta$

Prioridad de evaluación: **Emergencia ≻ Parada ≻ Marcha/Sensor/Temporizador**.

| #  | Origen              | Condición de guarda                                       | Destino   |
| -- | ------------------- | ---------------------------------------------------------- | --------- |
| T1 | $\forall s \in S$ | $e$                                                      | $S_4$   |
| T2 | $S_0$             | $\lnot e \land \lnot p \land m^{\uparrow}$               | $S_1$   |
| T3 | $S_1$             | $\lnot e \land p$                                        | $S_0$   |
| T4 | $S_1$             | $\lnot e \land \lnot p \land s^{\uparrow} \land \lnot d$ | $S_2$   |
| T5 | $S_1$             | $\lnot e \land \lnot p \land s^{\uparrow} \land d$       | $S_3$   |
| T6 | $S_2, S_3$        | $\lnot e \land \lnot p \land t$                          | $S_1$   |
| T7 | $S_2, S_3$        | $\lnot e \land p$                                        | $S_0$   |
| T8 | $S_4$             | $\lnot e \land p$ (rearme consciente)                    | $S_0$   |
| — | cualquier           | ninguna guarda verdadera                                   | permanece |

**Codificación *one-hot*.** Con $y_i = 1 \Leftrightarrow s = S_i$, las ecuaciones booleanas de estado siguiente son:

$$
\begin{aligned}
y_4' &= e \;\lor\; (y_4 \land \lnot p)\\
y_0' &= \lnot e \land \big[(y_0 \land (p \lor \lnot m^{\uparrow})) \lor (p \land (y_1 \lor y_2 \lor y_3 \lor y_4))\big]\\
y_1' &= \lnot e \land \lnot p \land \big[(y_0 \land m^{\uparrow}) \lor (y_1 \land \lnot s^{\uparrow}) \lor ((y_2 \lor y_3) \land t)\big]\\
y_2' &= \lnot e \land \lnot p \land \big[(y_1 \land s^{\uparrow} \land \lnot d) \lor (y_2 \land \lnot t)\big]\\
y_3' &= \lnot e \land \lnot p \land \big[(y_1 \land s^{\uparrow} \land d) \lor (y_3 \land \lnot t)\big]
\end{aligned}
$$

**Invariante de partición** (verificable por exhaustividad sobre $2^5 \cdot 2^6$ combinaciones y como aserción en Fase 2):

$$
\sum_{i=0}^{4} y_i' = 1 \quad \forall\, (y, \sigma) \text{ con } \textstyle\sum y_i = 1
$$

En la implementación ST, la codificación *one-hot* se sustituirá por una variable enumerada `E_EstadoClasificador` con `CASE`, semánticamente equivalente y más legible; las ecuaciones anteriores constituyen la especificación de referencia para las pruebas.

### 3.4 Función de salida $\lambda$ (Moore)

$$
Q_0 = y_1 \lor y_2 \lor y_3,\qquad Q_1 = y_3,\qquad Q_2 = y_2,\qquad Q_3 = y_3,\qquad Q_4 = y_4
$$

| Estado                      | $Q_0$ Cinta_Entrada | $Q_1$ Desviador | $Q_2$ Cinta_A | $Q_3$ Cinta_B | $Q_4$ Baliza | `systemStatus`        |
| --------------------------- | :-------------------: | :---------------: | :-------------: | :-------------: | :------------: | ----------------------- |
| $S_0$ Reposo              |           0           |         0         |        0        |        0        |       0       | `REPOSO`              |
| $S_1$ En_Marcha_Espera    |           1           |         0         |        0        |        0        |       0       | `ESPERANDO_PAQUETE`   |
| $S_2$ Clasificando_Ruta_A |           1           |         0         |        1        |        0        |       0       | `CLASIFICANDO_RUTA_A` |
| $S_3$ Clasificando_Ruta_B |           1           |         1         |        0        |        1        |       0       | `CLASIFICANDO_RUTA_B` |
| $S_4$ Parada_Emergencia   |           0           |         0         |        0        |        0        |       1       | `PARADA_EMERGENCIA`   |

$\lambda$ es **inyectiva** (códigos distintos), por lo que el middleware reconstruye el estado mediante $\lambda^{-1}: \Lambda \to S \cup \{\bot\}$ sin ampliar el mapa de memoria. Toda palabra de salida fuera de la tabla se reporta como `ESTADO_INDETERMINADO` ($\bot$) con fines de diagnóstico.

### 3.5 Oscilador de supervisión (Heartbeat)

Temporizador autorreiniciable `Heartbeat_Timer` ($PT = 500$ ms):

$$
\tau(k) = \mathrm{TON}\big(IN = \lnot\tau(k-1),\ PT = 500\ \text{ms}\big).Q,\qquad h(k+1) = h(k) \oplus \tau(k),\qquad Q_5 = h
$$

Se obtiene una onda cuadrada de periodo $T_h = 1$ s y ciclo de trabajo 50 %. Con muestreo $T_p = 50$ ms se obtienen $T_h/T_p = 20$ muestras por periodo, holgadamente por encima del criterio de Nyquist. El middleware declara el PLC no vivo si no observa una conmutación de $Q_5$ en $T_{stale} = 1500$ ms $= 3 \cdot PT$.

### 3.6 Propiedades de seguridad a verificar (lógica temporal)

| ID | Propiedad                                                | Expresión                                                                          |
| -- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P1 | Respuesta a emergencia en un ciclo de *scan*           | $\Box\big(e \rightarrow \bigcirc(Q_0{=}Q_1{=}Q_2{=}Q_3{=}0 \land Q_4{=}1)\big)$   |
| P2 | Exclusión mutua de cintas de salida                     | $\Box\,\lnot(Q_2 \land Q_3)$                                                      |
| P3 | Coherencia desviador–ruta                               | $\Box\,(Q_1 \leftrightarrow Q_3)$                                                 |
| P4 | Sin rearranque automático tras emergencia               | todo camino $S_4 \rightsquigarrow S_1$ atraviesa $S_0$ y exige $m^{\uparrow}$ |
| P5 | Inmunidad del destino al selector durante clasificación | $d$ solo interviene en T4/T5                                                      |

### 3.7 Hipótesis de diseño

- **H1 · Flujo unitario:** a lo sumo un paquete en la zona sensor–salida durante $S_2/S_3$; los flancos $s^{\uparrow}$ en esos estados se ignoran. La gestión de colas multi-paquete exigiría sensores adicionales y queda fuera de alcance.
- **H2 · Pulsos:** Marcha y Parada se escriben como pulsos de ancho $\geq 150$ ms, superior a $T_{scan} + T_p$.
- **H3 · Ciclo de tarea:** tarea cíclica del PLC con $T_{scan} = 10$ ms.
- **H4 · Seguridad funcional:** la emergencia modelada es lógica y didáctica; en una instalación real debe cablearse con contacto NC y circuito de seguridad conforme a ISO 13850 (International Organization for Standardization [ISO], 2015) e IEC 60204-1 (IEC, 2016).

```mermaid
stateDiagram-v2
  direction LR
  [*] --> S0
  S0: S0 · Reposo
  S1: S1 · En_Marcha_Espera
  S2: S2 · Clasificando_Ruta_A
  S3: S3 · Clasificando_Ruta_B
  S4: S4 · Parada_Emergencia
  S0 --> S1: T2 ¬e ∧ ¬p ∧ m↑
  S1 --> S0: T3 ¬e ∧ p
  S1 --> S2: T4 s↑ ∧ ¬d
  S1 --> S3: T5 s↑ ∧ d
  S2 --> S1: T6 t (TON_Clasif)
  S3 --> S1: T6 t (TON_Clasif)
  S2 --> S0: T7 p
  S3 --> S0: T7 p
  S0 --> S4: T1 e
  S1 --> S4: T1 e
  S2 --> S4: T1 e
  S3 --> S4: T1 e
  S4 --> S0: T8 ¬e ∧ p (rearme)
```

## 4. Modelo de proceso BPMN 2.0

El proceso se representa con la semántica de BPMN 2.0 (Object Management Group [OMG], 2011): un *pool* con tres *lanes*. Dado que Mermaid.js carece de un dialecto BPMN nativo, se adopta la convención: `(( ))` evento de inicio/fin, `[ ]` tarea, `{ }` compuerta exclusiva (XOR), `[/ /]` evento intermedio de mensaje, y aristas entre *lanes* como flujos de secuencia dentro del mismo *pool*.

```mermaid
flowchart TB
  subgraph L1["Lane 1 · Operador / Entorno 3D"]
    direction LR
    A0(("Inicio"))
    A1["Accionar Marcha"]
    A2["Generar paquete<br/>(spawner)"]
    A3["Seleccionar destino A/B"]
    A4[/"Sensor óptico detecta paquete<br/>(intersección geométrica)"/]
    A5["Animar cintas, desviador<br/>y baliza según %QX"]
    A6["Paquete despachado<br/>(despawn en extremo de salida)"]
    A7(("Fin"))
    AE["Accionar Emergencia"]
  end
  subgraph L2["Lane 2 · Middleware Node.js"]
    direction LR
    B1["Recibir comando WS<br/>validar contra esquema"]
    B2["Encolar escritura Modbus<br/>FC05 / pulso 150 ms"]
    B3["Polling 50 ms<br/>FC01 + FC02"]
    B4["Decodificar bits → JSON<br/>λ⁻¹ → systemStatus"]
    B5["Difundir estado a clientes WS"]
    BX{"¿Conexión<br/>Modbus OK?"}
    BR["Reconexión con<br/>retroceso exponencial"]
  end
  subgraph L3["Lane 3 · PLC Virtual CODESYS"]
    direction LR
    C1["Leer imagen de entradas %IX"]
    C2{"¿e = 1?"}
    C3["S4 · Parada_Emergencia<br/>Q4 = 1, actuadores = 0"]
    C4["Evaluar δ<br/>(Marcha / Parada / Sensor / TON)"]
    C5{"Destino d"}
    C6["S2 · Ruta A<br/>Q0, Q2"]
    C7["S3 · Ruta B<br/>Q0, Q1, Q3"]
    C8["Escribir imagen de salidas %QX<br/>+ Heartbeat Q5"]
  end

  A0 --> A1 --> B1
  A2 --> A3 --> B1
  A4 --> B1
  AE --> B1
  B1 --> B2 --> BX
  BX -- sí --> C1
  BX -- no --> BR --> BX
  C1 --> C2
  C2 -- sí --> C3 --> C8
  C2 -- no --> C4 --> C5
  C5 -- "d = 0" --> C6 --> C8
  C5 -- "d = 1" --> C7 --> C8
  C8 --> B3 --> B4 --> B5 --> A5 --> A6 --> A7
```

## 5. Diagrama de flujo de datos (DFD)

### 5.1 Nivel 0 (contexto)

```mermaid
flowchart LR
  OPR["Operador"]
  SYS(("Sistema de<br/>clasificación virtual"))
  ING["Ingeniero de<br/>puesta en marcha"]
  OPR -- "órdenes de mando, selector" --> SYS
  SYS -- "estado visual 3D, alarmas" --> OPR
  ING -- "programa ST, parámetros .env" --> SYS
  SYS -- "logs estructurados (pino)" --> ING
```

### 5.2 Nivel 1

```mermaid
flowchart LR
  E1["Operador"]
  P1(("1.0<br/>Capturar mando<br/>y emular sensor"))
  P2(("2.0<br/>Codificar y<br/>transportar"))
  P3(("3.0<br/>Ejecutar FSM<br/>de control"))
  P4(("4.0<br/>Renderizar<br/>planta 3D"))
  D1[("D1 · Imagen de proceso<br/>%IX / %QX")]
  D2[("D2 · Último estado JSON<br/>(caché en memoria)")]
  D3[("D3 · Registro de eventos<br/>pino NDJSON")]
  E1 -- "clic en botonera" --> P1
  P1 -- "comando JSON" --> P2
  P2 -- "FC05/FC15" --> D1
  D1 -- "%IX" --> P3
  P3 -- "%QX" --> D1
  D1 -- "FC01/FC02" --> P2
  P2 -- "estado JSON" --> D2
  D2 -- "broadcast WS" --> P4
  P4 -- "posición de paquetes" --> P1
  P2 -- "eventos/errores" --> D3
  P4 -- "escena 60 FPS" --> E1
```

## 6. Diagrama de secuencia temporal (polling cíclico vs. escritura por evento)

El middleware mantiene **una única conexión TCP** con el esclavo y serializa todas las transacciones mediante una cola FIFO con exclusión mutua, de modo que la escritura por evento se intercala entre lecturas cíclicas sin solapamiento de tramas (Modbus Organization, 2006). La planificación del *polling* emplea `setTimeout` reprogramado al finalizar cada transacción —no `setInterval`— para evitar acumulación de solicitudes si una respuesta excede $T_p$.

```mermaid
sequenceDiagram
  autonumber
  participant OP as Operador / Escena 3D
  participant WC as wsClient.js
  participant MW as puente-modbus-planta
  participant PLC as CODESYS (Modbus_TCP_Slave)

  Note over MW,PLC: Conexión TCP 127.0.0.1:502 · Unit ID 1 · timeout 2000 ms

  loop Ciclo de adquisición T_p = 50 ms
    MW->>PLC: FC01 Read Coils (addr 0, qty 5)
    PLC-->>MW: %IX0.0..%IX0.4
    MW->>PLC: FC02 Read Discrete Inputs (addr 0, qty 6)
    PLC-->>MW: %QX0.0..%QX0.5
    MW->>MW: decode() · λ⁻¹ · detectar flanco heartbeat
    MW-)WC: broadcast { timestamp, plcConnected, heartbeat, inputs, outputs, systemStatus }
    WC-)OP: actualizar cinemática (requestAnimationFrame)
  end

  par Escritura por evento (interrupción de UI)
    OP->>WC: clic «Marcha»
    WC->>MW: { type: "command", target: "marcha", action: "pulse" }
    MW->>MW: validar esquema · encolar
    MW->>PLC: FC05 Write Single Coil (0, ON)
    PLC-->>MW: eco FC05
    Note right of MW: t + 150 ms
    MW->>PLC: FC05 Write Single Coil (0, OFF)
    PLC-->>MW: eco FC05
    MW-)WC: { type: "ack", target: "marcha", ok: true }
  and Emulación de sensor (C3)
    OP->>WC: paquete entra en volumen del sensor
    WC->>MW: { type: "command", target: "sensorEntrada", action: "set", value: true }
    MW->>PLC: FC05 Write Single Coil (3, ON)
  end

  alt Pérdida de conexión / timeout 2000 ms
    MW-)WC: broadcast { plcConnected: false, systemStatus: "SIN_CONEXION_PLC" }
    loop retroceso exponencial 500 ms → 5000 ms
      MW->>PLC: connectTCP()
    end
  end
```

### 6.1 Presupuesto de latencia extremo a extremo

$$
L_{max} \approx T_{scan} + T_p + T_{tx} + T_{frame} \approx 10 + 50 + 2 + 16.7 \approx 79\ \text{ms}
$$

donde $T_{tx}$ es el tránsito Modbus + WebSocket en *loopback* y $T_{frame}$ el periodo de refresco a 60 FPS. El valor se sitúa por debajo del umbral de ~100 ms habitualmente asociado a la percepción de inmediatez en interfaces interactivas.

---

## Referencias

Fette, I., & Melnikov, A. (2011). *The WebSocket protocol* (RFC 6455). Internet Engineering Task Force. https://doi.org/10.17487/RFC6455

Hopcroft, J. E., Motwani, R., & Ullman, J. D. (2006). *Introduction to automata theory, languages, and computation* (3rd ed.). Pearson.

International Electrotechnical Commission. (2013). *Programmable controllers — Part 3: Programming languages* (IEC Standard No. 61131-3:2013).

International Electrotechnical Commission. (2016). *Safety of machinery — Electrical equipment of machines — Part 1: General requirements* (IEC Standard No. 60204-1:2016).

International Organization for Standardization. (2015). *Safety of machinery — Emergency stop function — Principles for design* (ISO Standard No. 13850:2015).

International Society of Automation. (2010). *Enterprise-control system integration — Part 1: Models and terminology* (ANSI/ISA-95.00.01-2010).

International Society of Automation. (2015). *Human machine interfaces for process automation systems* (ANSI/ISA-101.01-2015).

Modbus Organization. (2006). *MODBUS messaging on TCP/IP implementation guide V1.0b*. https://modbus.org/specs.php

Modbus Organization. (2012). *MODBUS application protocol specification V1.1b3*. https://modbus.org/specs.php

Moore, E. F. (1956). Gedanken-experiments on sequential machines. En C. E. Shannon & J. McCarthy (Eds.), *Automata studies* (pp. 129–153). Princeton University Press.

Object Management Group. (2011). *Business Process Model and Notation (BPMN), version 2.0* (formal/2011-01-03). https://www.omg.org/spec/BPMN/2.0
