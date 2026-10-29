# 08 · Especificación de la Fase 5: indicadores, estibas e informe de corrida

*Proyecto:* Planta Virtual de Clasificación Gobernada por PLC · *Versión:* 1.0.0 · *Fecha:* 2026-10-23 · *Estado:* estibas, estado $S_5$ y contrato v1.1.0 implementados el 2026-10-23 (§2–§3); indicadores, registro de eventos, interfaz de selección e informe CSV (§4–§7) pendientes

---

## 1. Propósito y decisiones aprobadas

La Fase 5 convierte la planta en un sistema de medición. Cada corrida de producción registra sus eventos, calcula indicadores clave de desempeño, *Key Performance Indicators, KPI,* en tiempo real y produce al cerrarse un informe en CSV para su análisis posterior. Además, los contenedores del final de cada ruta se sustituyen por estibas que se llenan hasta una capacidad configurable, y la línea se detiene cuando una estiba se llena, hasta que el operador la cambia.

| # | Decisión | Valor aprobado (2026-10-23) |
|:-:|---|---|
| 1 | Quién detiene la línea cuando una estiba se llena | *Opción A:* el PLC, con un estado nuevo y dos señales de planta |
| 2 | Formato del informe | CSV orientado a Python: separador `,`, punto decimal, UTF-8 |
| 3 | Capacidad de la estiba | Ajustable; 12 unidades por defecto |

La opción A respeta el principio de la arquitectura según el cual la HMI emula la planta pero nunca decide transiciones de proceso (`05_arquitectura_de_software.md`, decisión D1). Detener la línea es una decisión de control, y por tanto corresponde al PLC.

## 2. Estibas

### 2.1 Geometría y patrón de carga

Cada salida termina en una estiba de madera de 1,2 × 1,0 × 0,144 m, con el lado largo en el sentido de la ruta. Los paquetes, de 0,30 × 0,25 × 0,20 m, se acomodan en un patrón de 4 × 4 por capa: cuatro a lo largo y cuatro a lo ancho, con el lado largo del paquete alineado con la ruta. Las posiciones se ocupan fila a fila dentro de cada capa y capa a capa.

| Parámetro | Valor |
|---|---|
| Posiciones por capa | 16 (4 × 4) |
| Capacidad por defecto | 12 (tres filas de la primera capa) |
| Capacidad admisible | 1 a 48 (hasta tres capas; la carga completa queda por debajo de la cota de las cintas) |
| Distancia del extremo de la cinta al centro de la estiba | 0,75 m |

Al caer de la cinta, el paquete describe una trayectoria de unos 0,6 s hasta su posición, como si lo colocara un paletizador. El cambio de capacidad se aplica a las estibas que se coloquen a partir de ese momento; la estiba en curso conserva la suya, salvo que esté vacía, en cuyo caso la toma de inmediato. El orden exacto de llenado y la ecuación de la trayectoria están en `03_manual_puesta_en_marcha.md` §5.3 (Figura 7).

### 2.2 Señal de estiba no disponible

La HMI emula, para cada ruta, un sensor de *estiba no disponible*. Está activo en dos situaciones: cuando la estiba alcanza su capacidad o mientras se está cambiando. En el contrato se llama `estibaLlenaA` y `estibaLlenaB` (§3.2), por ser el caso habitual.

### 2.3 Cambio de estiba

Cada estiba tiene un botón «Cambiar estiba» en el panel. Está habilitado cuando la estiba tiene carga y está llena, o cuando la línea está detenida (Reposo, emergencia, espera de cambio de estiba o sin conexión con el PLC), para retirar estibas parciales al final de la jornada. El cambio dura 3 s: la estiba sale 2,2 m en el sentido de su ruta, como si la retirara un montacargas, y la vacía entra 2,2 m por el costado opuesto a la otra estiba, para no atravesar su carga. La señal de estiba no disponible se mantiene activa durante todo el cambio y se libera cuando la estiba nueva está en su lugar. Cada estiba retirada se registra como salida del proceso, indicando si salió completa o parcial.

## 3. Extensión del controlador (decisión A)

### 3.1 Estado, transiciones y salida nuevos

Se añade al autómata un estado $S_5$, *Esperando cambio de estiba*, y dos entradas de nivel, $\ell_A$ y $\ell_B$, con $\ell = \ell_A \lor \ell_B$. La prioridad de evaluación pasa a ser Emergencia ≻ Estiba no disponible ≻ Parada ≻ resto. Mientras haya una estiba no disponible, la línea no se mueve: cualquier estado distinto de la emergencia conduce a $S_5$, y solo se sale de él hacia el Reposo cuando ambas estibas están disponibles. Desde el Reposo, la línea exige un nuevo flanco de Marcha, del mismo modo que tras una emergencia.

| # | Origen | Guarda | Destino |
|---|---|---|---|
| T9 | $S_0, S_1, S_2, S_3$ | $\lnot e \land \ell$ | $S_5$ |
| T10 | $S_5$ | $\lnot e \land \lnot \ell$ | $S_0$ |
| T1 | $S_5$ (ampliación) | $e$ | $S_4$ |

Si una emergencia se rearma con una estiba todavía llena, T8 lleva a $S_0$ y T9 a $S_5$ en el ciclo siguiente.

La función de salida añade $Q_6$, *Señal de cambio de estiba* (baliza ámbar), y anula las salidas de movimiento en $S_5$. La palabra de $S_5$ es distinta de todas las demás, de modo que $\lambda$ sigue siendo inyectiva:

$$
Q_6 = y_5, \qquad (Q_0, Q_1, Q_2, Q_3, Q_4, Q_6)\big|_{S_5} = (0, 0, 0, 0, 0, 1)
$$

Se añade una propiedad de seguridad:

| Propiedad | Enunciado |
|---|---|
| P6 | Con una estiba no disponible y sin emergencia, ninguna cinta se mueve en el ciclo siguiente: $\Box\big(\ell \land \lnot e \rightarrow \bigcirc(Q_0 = Q_2 = Q_3 = 0)\big)$ |
| P7 | Tras un cambio de estiba la línea no rearranca sola: todo camino $S_5 \rightsquigarrow S_1$ atraviesa $S_0$ y exige $m^{\uparrow}$ |

### 3.2 Contrato Modbus v1.1.0

La ampliación solo añade direcciones; ninguna existente se reasigna, conforme a `02_mapeo_memoria_modbus.md` §1.

| Dirección | Modbus | Variable PLC | Campo JSON | Semántica |
|---|---|---|---|---|
| `%IX0.5` | Coil 5 | `Estiba_Llena_A` | `inputs.estibaLlenaA` | Estiba A no disponible (llena o en cambio) |
| `%IX0.6` | Coil 6 | `Estiba_Llena_B` | `inputs.estibaLlenaB` | Estiba B no disponible |
| `%QX0.6` | Discrete Input 6 | `Senal_Cambio_Estiba` | `outputs.senalCambioEstiba` | Baliza ámbar de cambio de estiba |

Consecuencias en el resto del contrato:

- *Esclavo Modbus:* pasa a 7 coils y 7 discrete inputs.
- *Lectura de entradas (FC01):* 7 coils.
- *Lectura de salidas (FC02):* 7 discrete inputs.
- *Inicialización segura (FC15):* escribe `[0, 0, e, 0, d, ℓA, ℓB]` y conserva las señales de estiba igual que la seta y el selector.
- *Estados (`systemStatus`):* se añade `ESPERANDO_CAMBIO_ESTIBA`. La reconstrucción $\lambda^{-1}$ opera sobre seis bits $(q_0 \dots q_4, q_6)$, y la palabra `000001` corresponde al estado nuevo.
- *Lista blanca:* se añaden `estibaLlenaA` y `estibaLlenaB`, ambos con acción `set`.

### 3.3 Pruebas nuevas del protocolo

| Caso | Precondición | Estímulo | Resultado esperado | Propiedad |
|:-:|---|---|---|---|
| CP-15 | `EN_MARCHA_ESPERA` | estiba A llena | `ESPERANDO_CAMBIO_ESTIBA`; cintas paradas; Q6 = 1 | T9, P6 |
| CP-16 | `CLASIFICANDO_RUTA_B` | estiba B llena | `ESPERANDO_CAMBIO_ESTIBA` en el mismo ciclo | T9, P6 |
| CP-17 | `REPOSO` con estiba llena | pulso Marcha | permanece en `ESPERANDO_CAMBIO_ESTIBA` | T9 |
| CP-18 | `ESPERANDO_CAMBIO_ESTIBA` | estiba liberada | `REPOSO`; solo arranca con un flanco nuevo de Marcha | T10, P7 |
| CP-19 | `ESPERANDO_CAMBIO_ESTIBA` | Emergencia y rearme con la estiba aún llena | `PARADA_EMERGENCIA`; tras el rearme, `REPOSO` y luego `ESPERANDO_CAMBIO_ESTIBA` | T1, T8, T9 |

## 4. Indicadores de desempeño

### 4.1 Contabilidad del tiempo

Los indicadores de disponibilidad se derivan de la secuencia de estados que publica el middleware cada 50 ms. La HMI acumula el tiempo transcurrido entre dos mensajes consecutivos en el estado vigente, y el tiempo sin conexión con el middleware en un estado propio, `SIN_MIDDLEWARE`. Con esas acumulaciones se definen tres tiempos agregados.

$$
T_{op} = T_{espera} + T_{clas,A} + T_{clas,B}, \qquad T_{np} = T_{emerg} + T_{sin\,PLC} + T_{sin\,MW} + T_{estiba}, \qquad T_{corrida} = T_{op} + T_{np} + T_{reposo}
$$

El tiempo operativo $T_{op}$ es aquel en que la línea está en marcha. Los paros no planificados $T_{np}$ incluyen la emergencia, la falta de comunicación y la espera de cambio de estiba. El reposo se considera paro planificado y no penaliza la disponibilidad (`07_fundamentos_teoricos.md` §9).

### 4.2 Catálogo

El catálogo vive en `hmi-planta-3d/src/kpi/catalogo.js`. Cada indicador es un registro con identificador, nombre, categoría, unidad, descripción, fuente, función de cálculo y meta. Agregar un indicador equivale a agregar un registro. Las metas son valores iniciales para la práctica y se ajustan en el propio catálogo.

```js
{
  id: 'precision_clasificacion',
  nombre: 'Precisión de clasificación',
  categoria: 'Calidad',
  unidad: '%',
  descripcion: 'Paquetes despachados por la ruta esperada sobre el total despachado',
  fuente: 'HMI · paquetes',
  calcular: (datos) => (datos.despachados ? (100 * datos.correctos) / datos.despachados : null),
  meta: { verde: (v) => v >= 99.5, ambar: (v) => v >= 98 },
}
```

Sea $N$ el número de paquetes depositados, $N_{ok}$ los depositados en la estiba de su destino esperado y $t^* = T_{clas} = 4$ s el ciclo ideal (parámetro `ciclo_ideal_s`).

| Id | Indicador | Categoría | Definición | Unidad | Meta inicial (verde · ámbar) |
|---|---|---|---|---|---|
| `paquetes_generados` | Paquetes generados | Producción | conteo | u | — |
| `paquetes_despachados` | Paquetes despachados | Producción | $N$, total y por ruta | u | — |
| `throughput_ultimo_minuto` | Throughput del último minuto | Producción | depósitos en los últimos 60 s | paq/min | ≥ 7 · ≥ 5 |
| `throughput_medio` | Throughput medio | Producción | $N / T_{corrida}$ | paq/min | ≥ 7 · ≥ 5 |
| `tiempo_ciclo_medio` | Tiempo de ciclo | Producción | intervalo medio entre depósitos consecutivos en tiempo operativo | s | ≤ 8,5 · ≤ 12 |
| `tiempo_clasificacion_medio` | Tiempo de clasificación | Producción | media de sensor → depósito | s | — |
| `tiempo_transito_medio` | Tiempo de tránsito | Producción | media de generación → depósito | s | — |
| `mal_clasificados` | Mal clasificados | Calidad | $N - N_{ok}$ | u | 0 · ≤ 1 |
| `precision_clasificacion` | Precisión de clasificación | Calidad | $100 \cdot N_{ok} / N$ | % | ≥ 99,5 · ≥ 98 |
| `distribucion_estados` | Distribución de estados | Disponibilidad | tiempo en cada estado / $T_{corrida}$ | % | — |
| `disponibilidad` | Disponibilidad | Disponibilidad | $T_{op} / (T_{op} + T_{np})$ | % | ≥ 90 · ≥ 75 |
| `utilizacion` | Utilización | Disponibilidad | $(T_{clas,A} + T_{clas,B}) / T_{op}$ | % | — |
| `emergencias` | Paradas de emergencia | Disponibilidad | entradas en `PARADA_EMERGENCIA` | u | 0 · ≤ 1 |
| `mttr_emergencia` | Tiempo medio de rearme | Disponibilidad | duración media de los episodios de emergencia | s | ≤ 30 · ≤ 60 |
| `perdidas_comunicacion` | Pérdidas de comunicación | Disponibilidad | episodios y tiempo sin PLC o sin middleware | u, s | 0 · ≤ 1 |
| `ocupacion_estiba` | Ocupación de estiba | Estibas | unidades / capacidad, por ruta | u, % | — |
| `estibas_completadas` | Estibas completadas | Estibas | estibas retiradas llenas, por ruta | u | — |
| `tiempo_llenado_estiba` | Tiempo de llenado | Estibas | media desde la colocación hasta llenarse | s | — |
| `bloqueo_por_estiba` | Bloqueo por estiba | Estibas | $T_{estiba}$ total y medio por cambio | s | medio ≤ 20 · ≤ 40 |
| `rendimiento` | Rendimiento | OEE | $N \, t^* / T_{op}$ | % | ≥ 60 · ≥ 40 |
| `calidad` | Calidad | OEE | $N_{ok} / N$ | % | ≥ 99,5 · ≥ 98 |
| `oee` | OEE | OEE | disponibilidad × rendimiento × calidad | % | ≥ 55 · ≥ 35 |
| `refresco_estado` | Refresco del estado | Sistema | intervalo medio entre mensajes de estado | ms | ≤ 60 · ≤ 100 |
| `latencia_comando` | Latencia de comando | Sistema | tiempo medio de comando `set` → `ack` | ms | ≤ 50 · ≤ 100 |

Con la alimentación automática se espera un rendimiento cercano al 48 % y una OEE en la franja ámbar. Es un resultado previsto por el modelo, no un defecto (`07` §9).

### 4.3 Selecciones predefinidas

| Selección | Indicadores |
|---|---|
| Operación | throughput del último minuto, tiempo de ciclo, ocupación de estibas, distribución de estados |
| Calidad | mal clasificados, precisión de clasificación |
| OEE | disponibilidad, rendimiento, calidad, OEE |
| Todos | el catálogo completo |

## 5. Registro de eventos

### 5.1 Modelo de datos

Los indicadores no se almacenan: se derivan de un registro de eventos por corrida. Así, un indicador añadido más adelante puede recalcularse sobre corridas pasadas.

| Entidad | Campos |
|---|---|
| Corrida | `id` (instante de inicio, `AAAAMMDD-HHMMSS`), `inicio`, `fin`, `capacidad_estiba`, `ciclo_ideal_s`, `version_contrato`, `seleccion_kpis` |
| Evento | `corrida_id`, `secuencia`, `t_s` (segundos desde el inicio), `instante` (ISO 8601 con zona), `tipo`, `detalle` |
| Paquete | `corrida_id`, `paquete_id`, tiempos de generación, sensor y depósito, `ruta`, `destino_esperado`, `correcto`, `estiba_numero`, `posicion`, `capa` |
| Muestra | `corrida_id`, `t_s`, `kpi_id`, `valor`; una por indicador seleccionado cada 5 s |

| Tipo de evento | Detalle |
|---|---|
| `corrida_inicio`, `corrida_fin` | parámetros de la corrida |
| `estado` | `desde`, `hacia` |
| `conexion` | `capa` (middleware o PLC), `conectado` |
| `orden` | `target`, `action`, `value`, `ok`, `error` |
| `paquete_generado` | `paquete_id` |
| `sensor` | `ocupado` |
| `paquete_depositado` | `paquete_id`, `ruta`, `destino_esperado`, `correcto`, `estiba_numero`, `posicion`, `capa` |
| `estiba_llena` | `ruta`, `estiba_numero`, `unidades` |
| `estiba_retirada` | `ruta`, `estiba_numero`, `unidades`, `completa` |
| `parametro` | `nombre`, `valor` (p. ej., cambio de capacidad) |

### 5.2 Almacenamiento

El registro se guarda en IndexedDB, la base de datos del navegador. La base `planta-clasificacion` tiene tres almacenes: `corridas` (clave `id`), `eventos` (clave autoincremental, índice por `corrida_id`) y `paquetes` (clave `[corrida_id, paquete_id]`). Los datos sobreviven a una recarga de la página. Se conservan las últimas 20 corridas, que pueden volver a descargarse desde el menú.

## 6. Interfaz

- *Barra superior sobre la escena:* `▶ Iniciar corrida`, `■ Finalizar`, cronómetro y nombre de la corrida, `Indicadores ▾` y `Vista ▾`. «Vista» incluye las etiquetas de E/S, el reinicio de cámara y los parámetros de geometría, que salen del panel lateral para hacerle sitio.
- *Menú de indicadores:* casillas agrupadas por categoría, las selecciones predefinidas de §4.3 y el acceso a corridas anteriores. La selección se recuerda en el navegador.
- *Panel lateral:*
  - Una sección «Indicadores» con una tarjeta por KPI seleccionado: valor, unidad y color según su meta.
  - Fuera de una corrida, muestra «Sin corrida activa».
  - Una sección «Estibas» con la ocupación de cada una, su capacidad y el botón «Cambiar estiba».
- *Baliza:* añade un módulo ámbar que destella con Q6.
- *Informe:* al pulsar «Finalizar» se abre un resumen de la corrida con los indicadores finales y botones para descargar cada archivo. Las descargas son explícitas para evitar el bloqueo de descargas múltiples del navegador.

## 7. Informe CSV

### 7.1 Formato

Los archivos siguen RFC 4180 (Shafranovich, 2005) y se orientan a Python y pandas:

| Aspecto | Convención |
|---|---|
| Codificación | UTF-8 sin BOM |
| Separador y decimal | `,` y `.` |
| Fin de línea | CRLF |
| Cabecera | Nombres en `snake_case` sin tildes |
| Tiempo | `t_s` en segundos desde el inicio, con tres decimales; `instante` en ISO 8601 con desfase horario |
| Booleanos y ausentes | `true` / `false`; celda vacía |
| Nombre de archivo | `corrida_AAAAMMDD-HHMMSS_<tabla>.csv` |

### 7.2 Archivos

| Archivo | Una fila por | Columnas |
|---|---|---|
| `_kpis.csv` | indicador o componente | `corrida_id, kpi_id, nombre, categoria, valor, unidad, estado_meta, seleccionado` |
| `_paquetes.csv` | paquete | `corrida_id, paquete_id, t_generado_s, t_sensor_s, t_deposito_s, ruta, destino_esperado, correcto, estiba_numero, posicion, capa, tiempo_clasificacion_s, tiempo_transito_s` |
| `_eventos.csv` | evento | `corrida_id, secuencia, t_s, instante, tipo, detalle` (`detalle` en JSON) |
| `_serie.csv` | muestra | `corrida_id, t_s, kpi_id, valor` (formato largo) |

Los indicadores con varios componentes (por ruta o por estado) se expanden en una fila por componente con un sufijo, por ejemplo `paquetes_despachados_a` o `distribucion_estados_reposo`.

### 7.3 Lectura en Python

```python
import json
import pandas as pd

base = "corrida_20261023-094127"
kpis = pd.read_csv(f"{base}_kpis.csv")
paquetes = pd.read_csv(f"{base}_paquetes.csv")
eventos = pd.read_csv(f"{base}_eventos.csv", parse_dates=["instante"])
eventos["detalle"] = eventos["detalle"].map(json.loads)
serie = pd.read_csv(f"{base}_serie.csv").pivot(index="t_s", columns="kpi_id", values="valor")
```

## 8. Pruebas de aceptación

| Ámbito | Pruebas |
|---|---|
| PLC (ambos controladores) | CP-15 a CP-19 (§3.3), además del protocolo existente |
| Middleware | Contrato v1.1.0: lectura de 7 bits, $\lambda^{-1}$ de seis bits, lista blanca ampliada, FC15 de 7 coils |
| Modelo de planta | Posiciones del patrón por capas, capacidad, señal de estiba durante el llenado y el cambio |
| Motor de KPIs | Cálculo sobre registros de eventos sintéticos con resultado conocido |
| CSV | Escritura y relectura con un analizador estricto; tipos y número de columnas |
| Extremo a extremo | Corrida en el navegador hasta llenar una estiba, cambio, informe y verificación de los cuatro CSV |

*Estado al 2026-10-23:* superadas las pruebas del PLC (CP-15 a CP-19 en el PLC virtual), del middleware, del modelo de planta y una verificación de extremo a extremo del ciclo de estiba (llenado, parada, cambio y rearme). Pendientes las del motor de KPIs, el CSV y el informe; CP-15 a CP-19 en CODESYS se ejecutan en el laboratorio.

## 9. Impacto en el laboratorio

El programa de CODESYS cambia: los `.st` incorporan $S_5$, T9, T10 y Q6, y el esclavo Modbus pasa a 7 coils y 7 discrete inputs. Esa parte ya está implementada: el laboratorio debe seguir los pasos de la entrada de la Fase 5 en `windows/REGISTRO_DE_CAMBIOS.md`.

---

## Referencias

International Organization for Standardization. (2014). *Automation systems and integration — Key performance indicators (KPIs) for manufacturing operations management — Part 2: Definitions and descriptions* (ISO Standard No. 22400-2:2014).

Nakajima, S. (1988). *Introduction to TPM: Total productive maintenance*. Productivity Press.

Shafranovich, Y. (2005). *Common format and MIME type for comma-separated values (CSV) files* (RFC 4180). Internet Engineering Task Force. https://doi.org/10.17487/RFC4180
