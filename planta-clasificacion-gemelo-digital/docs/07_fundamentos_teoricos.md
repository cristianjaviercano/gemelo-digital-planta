# 07 · Fundamentos teóricos

*Proyecto:* Planta Virtual de Clasificación Gobernada por PLC · *Versión:* 1.0.0 · *Fecha:* 2026-10-23

---

## 1. Propósito

El documento expone los fundamentos conceptuales y matemáticos que sostienen las decisiones de diseño de la planta. Cada sección termina con su *implicación para el diseño*, de modo que cualquier parámetro del sistema (el ciclo de 10 ms, el pulso de 150 ms, el umbral de 1500 ms del heartbeat o los 4 s de clasificación) pueda rastrearse hasta el principio que lo justifica. La sección 10 reúne esa trazabilidad en una tabla.

## 2. Modelo digital, sombra digital y gemelo digital

El término *gemelo digital* designa una representación virtual de un objeto físico que se mantiene vinculada a él a lo largo de su ciclo de vida. Grieves y Vickers (2017) lo plantean como un medio para anticipar comportamientos emergentes no deseados en sistemas complejos antes de que se manifiesten en el objeto real, y Tao et al. (2019) documentan su adopción progresiva en la industria como soporte del diseño, la operación y el mantenimiento.

La literatura, sin embargo, usa el término con alcances distintos. Kritzinger et al. (2018) proponen una clasificación basada en el grado de automatización del flujo de datos entre el objeto físico y el digital. En el *modelo digital* ambos flujos son manuales. En la *sombra digital* los datos fluyen de forma automática solo del objeto físico al digital. En el *gemelo digital*, por último, el flujo es automático en ambos sentidos, de modo que el objeto digital puede también actuar sobre el físico.

Bajo esta clasificación, el sistema del proyecto carece de objeto físico: la planta es enteramente virtual y es gobernada por un controlador. En sentido estricto se trata de un *modelo digital de la planta acoplado a un controlador*, empleado para la puesta en marcha virtual (§3). La denominación «gemelo digital» del proyecto se usa en su acepción didáctica. La arquitectura, no obstante, deja preparada la transición: si se conectara una planta física al mismo esclavo Modbus, el middleware y el contrato de datos no cambiarían, y la HMI pasaría a funcionar como sombra digital.

*Implicación para el diseño:* el contrato de datos (`02_mapeo_memoria_modbus.md`) no supone que la planta sea virtual. Las señales de la planta (sensor de entrada, y en la Fase 5 los sensores de estiba llena) llegan al PLC por la misma vía que llegarían desde un equipo real.

## 3. Puesta en marcha virtual

La puesta en marcha real de un sistema de manufactura enfrenta un controlador real con una planta real, y suele concentrar la depuración del programa de control en la etapa más cara y con menos margen del proyecto. La *puesta en marcha virtual*, *Virtual Commissioning, VC,* sustituye la planta por un modelo y conserva el controlador real, de modo que el programa se depura antes de que exista el equipo físico (Lee & Park, 2014). Lechler et al. (2019) señalan que la puesta en marcha virtual mejora la calidad y la eficiencia de la ingeniería de producción y la sitúan como uno de los cimientos del gemelo digital.

Lee y Park (2014) identifican dos exigencias del modelo de planta: un *modelo físico* de cada dispositivo (geometría y cinemática) y un *modelo lógico* (su comportamiento como sensor o actuador frente a las señales del controlador). En el proyecto, el modelo físico es la geometría y cinemática de la HMI 3D (§8) y el modelo lógico es la emulación del sensor y la respuesta de cintas, paleta y baliza a las salidas `%QX`.

El proyecto opera en dos configuraciones:

| Configuración | Controlador | Planta | Uso |
|---|---|---|---|
| Laboratorio SILOGE (Windows) | CODESYS Control Win V3, un runtime IEC 61131-3 real que ejecuta los `.st` | HMI 3D | Puesta en marcha virtual propiamente dicha: valida el programa del PLC |
| Desarrollo (macOS) | `plc-virtual/`, traducción del programa a JavaScript | HMI 3D | Software en el lazo, *software-in-the-loop*, para desarrollar las capas superiores sin CODESYS |

*Implicación para el diseño:* el PLC virtual no sustituye la validación en CODESYS, porque no ejecuta los `.st`. Por eso los `.st` son la fuente de verdad, y el protocolo CP-01…CP-19 se ejecuta igual contra ambos controladores para detectar cualquier divergencia (`03_manual_puesta_en_marcha.md` §3).

## 4. Control secuencial conforme a IEC 61131-3

### 4.1 Ciclo de scan

Un controlador programable conforme a IEC 61131-3 (International Electrotechnical Commission [IEC], 2013) ejecuta sus programas en tareas cíclicas. En cada ciclo el runtime copia las entradas físicas a una imagen de proceso, ejecuta el programa sobre esa imagen congelada y, al terminar, copia la imagen de salidas a los actuadores (John & Tiegelkamp, 2010). Esta disciplina garantiza que el programa razone sobre un estado coherente de la planta, pero convierte al controlador en un sistema de tiempo discreto: una señal solo existe para el programa en los instantes de muestreo.

Si $x(t)$ es una entrada y $T_{scan}$ el periodo de la tarea, el programa observa la secuencia

$$
x_k = x(k \, T_{scan}), \qquad k = 0, 1, 2, \dots
$$

Un evento cuya duración sea menor que $T_{scan}$ puede caer entre dos muestras y pasar inadvertido. De ahí la hipótesis H2 del diseño: los pulsadores se emulan con pulsos de 150 ms, holgadamente mayores que el ciclo de 10 ms (§5.2).

### 4.2 Máquina de Moore

El clasificador se modela como una máquina de Moore (Moore, 1956), un autómata finito transductor cuya salida depende solo del estado (Hopcroft et al., 2006):

$$
M = (S, \Sigma, \Lambda, \delta, \lambda, s_0), \qquad \delta: S \times \Sigma \to S, \qquad \lambda: S \to \Lambda
$$

La alternativa, una máquina de Mealy, hace depender la salida también de la entrada vigente. En un controlador industrial la formulación de Moore tiene dos ventajas. Primero, las salidas permanecen estables durante todo el ciclo aunque las entradas cambien. Segundo, si $\lambda$ es inyectiva, el estado puede reconstruirse a partir de las salidas observadas mediante $\lambda^{-1}$. El middleware aprovecha esta propiedad: deduce `systemStatus` de los cinco bits de salida sin necesidad de que el PLC publique su estado interno (`01_arquitectura_y_flujos.md` §3.4).

### 4.3 Flancos y temporizadores

Las órdenes de Marcha y el sensor de entrada se interpretan por flanco ascendente, es decir, por el instante en que la señal pasa de 0 a 1, y no por su nivel. El bloque estándar `R_TRIG` lo calcula comparando la muestra actual con la anterior:

$$
x^{\uparrow}_k = x_k \land \lnot x_{k-1}
$$

Usar el flanco evita que un pulsador mantenido presionado provoque arranques repetidos. Es la base de la propiedad P4: tras una emergencia, mantener Marcha pulsada no rearranca la línea, porque no hay un flanco nuevo.

El temporizador de retardo a la conexión `TON` activa su salida cuando su entrada lleva activa al menos un tiempo preestablecido $PT$. Si $t_{on}$ es el instante del último flanco ascendente de la entrada:

$$
Q(t) = IN(t) \land \big(t - t_{on} \geq PT\big)
$$

El clasificador usa un `TON` con $PT = T_{clas}$ para decidir cuándo ha salido el paquete (transición T6).

### 4.4 Oscilador de supervisión (heartbeat)

El heartbeat es una onda cuadrada que el PLC conmuta mientras su programa se ejecuta. Se construye con un `TON` que se reinicia a sí mismo: su entrada es la negación de su propia salida. En el ciclo en que la salida se activa se conmuta el pulso; en el siguiente, la entrada cae y el temporizador se reinicia; en el siguiente vuelve a arrancar. Cada semiperiodo dura, por tanto, el tiempo preestablecido más dos ciclos de scan:

$$
\frac{T_h}{2} = PT + 2\,T_{scan} = 500 + 2 \cdot 10 = 520 \text{ ms} \quad\Rightarrow\quad T_h = 1040 \text{ ms}
$$

El valor se verificó simulando el bloque con el PLC virtual (conmutaciones a 500, 1020, 1540… ms). La desviación de 40 ms respecto al periodo nominal de 1 s no afecta a la supervisión, que tolera 1500 ms sin conmutación (§6.1).

### 4.5 Propiedades de seguridad

El diseño exige siete propiedades, expresadas en lógica temporal en `01_arquitectura_y_flujos.md` §3.6 (P1–P5) y `08_especificacion_fase5.md` §3.1 (P6–P7), y verificadas por el protocolo de pruebas:

| Propiedad | Enunciado | Casos que la verifican |
|---|---|---|
| P1 | La emergencia lleva a todas las salidas de movimiento a 0 en el mismo ciclo | CP-09 |
| P2 | Las cintas de salida A y B nunca funcionan a la vez | CP-14 |
| P3 | El desviador está en B si y solo si funciona la cinta B | CP-14 |
| P4 | No hay rearranque automático tras una emergencia | CP-10, CP-11, CP-12 |
| P5 | El selector solo influye en el instante del flanco del sensor | CP-06 |
| P6 | Con una estiba no disponible y sin emergencia, ninguna cinta se mueve en el ciclo siguiente | CP-15, CP-16 |
| P7 | Tras un cambio de estiba la línea no rearranca sola: exige pasar por Reposo y un flanco de Marcha | CP-18 |

*Implicación para el diseño:* la prioridad de evaluación Emergencia ≻ Estiba no disponible ≻ Parada ≻ resto de transiciones se codifica en el orden del `IF … ELSIF` del bloque `FB_ClasificadorFSM`, y la detección de flancos se ejecuta en cada ciclo, incluso durante la emergencia, para que un flanco no quede latente (P4).

## 5. Comunicación industrial

### 5.1 Modbus TCP

Modbus es un protocolo de aplicación de tipo petición-respuesta: un cliente, o maestro, envía peticiones y un servidor, o esclavo, las responde; el esclavo nunca transmite por iniciativa propia (Modbus Organization, 2012). Su modelo de datos distingue cuatro tablas: *discrete inputs* (bits de solo lectura), *coils* (bits de lectura y escritura), *input registers* y *holding registers* (palabras de 16 bits). Sobre TCP, cada trama se encapsula con una cabecera MBAP que incluye un identificador de transacción y el identificador de unidad, y el puerto reservado es el 502 (Modbus Organization, 2006).

El proyecto usa cuatro funciones: FC01 (leer coils), FC02 (leer discrete inputs), FC05 (escribir un coil) y FC15 (escribir varios coils). En el esclavo de CODESYS, los coils son entradas del PLC (`%IX`) y los discrete inputs son salidas (`%QX`). Por eso el maestro escribe órdenes en coils y lee el estado de los actuadores en discrete inputs.

### 5.2 Muestreo, pulsos y latencia

Como el esclavo no notifica cambios, el middleware debe preguntar periódicamente, cada $T_p = 50$ ms. Esa consulta es un muestreo, y el teorema de muestreo establece que una señal solo puede reconstruirse sin pérdida si la frecuencia de muestreo supera el doble de su componente de mayor frecuencia (Shannon, 1949). Para el heartbeat, de frecuencia $f_h = 1/T_h \approx 0{,}96$ Hz, el muestreo a $f_s = 20$ Hz ofrece unas 20 muestras por periodo, muy por encima del mínimo de dos.

Para las órdenes, el problema es el inverso: el PLC debe ver el pulso y el middleware debe poder leerlo de vuelta (*readback*) antes de que termine. Un pulso de ancho $T_{pulse}$ queda garantizado para ambos si

$$
T_{pulse} > T_{scan} + T_p = 10 + 50 = 60 \text{ ms}
$$

El valor elegido, 150 ms, deja un margen de 2,5 veces. La configuración del middleware rechaza al arrancar cualquier pulso más corto que el ciclo de lectura.

La latencia extremo a extremo, desde que el PLC cambia una salida hasta que la escena 3D la refleja, se acota sumando los retardos de cada etapa: el ciclo del PLC, el periodo de lectura, el transporte y un fotograma de la escena a 60 Hz.

$$
L_{max} \approx T_{scan} + T_p + T_{tx} + T_{frame} \approx 10 + 50 + 2 + 16{,}7 \approx 79 \text{ ms}
$$

### 5.3 Disciplina transaccional

Modbus TCP admite varias transacciones en curso gracias al identificador de transacción, pero muchos esclavos las atienden de una en una. El middleware mantiene una sola conexión y serializa todas las transacciones en una cola FIFO, de forma que una escritura por evento se intercala entre lecturas sin solaparse. La siguiente lectura se programa al terminar la anterior, no a intervalos fijos. Si una respuesta tarda $T_{tx}$, el periodo efectivo es $\max(T_p, T_{tx})$ y las peticiones nunca se acumulan.

### 5.4 WebSocket

Un navegador no puede abrir conexiones TCP arbitrarias, por lo que la HMI no puede hablar Modbus directamente. El protocolo WebSocket establece, tras una negociación HTTP, un canal bidireccional y persistente sobre una única conexión TCP (Fette & Melnikov, 2011). Ese canal permite al servidor empujar el estado a todos los clientes sin que estos lo soliciten, lo que se ajusta a la difusión periódica del estado de la planta, y a la vez admite los comandos en sentido contrario.

*Implicación para el diseño:* la capa C2 existe porque los dos extremos hablan protocolos incompatibles (Modbus TCP frente a WebSocket). Su diseño (cola única, lectura reprogramada, pulsos de 150 ms y lectura de retorno) se deriva de las restricciones de muestreo de esta sección.

## 6. Supervisión, fallos y seguridad

### 6.1 Vigilancia del controlador

Una conexión TCP abierta no garantiza que el programa del PLC se esté ejecutando: el runtime puede estar detenido mientras su pila de comunicaciones sigue respondiendo. El heartbeat resuelve esta ambigüedad. Si el middleware no observa una conmutación del heartbeat en un intervalo $T_{stale}$, declara el PLC no vivo:

$$
T_{stale} = 3 \cdot PT = 1500 \text{ ms} > T_h / 2 + T_p = 570 \text{ ms}
$$

El umbral triplica el tiempo preestablecido del oscilador. Así tolera la variación del ciclo y la latencia de lectura sin falsas alarmas, y detecta un PLC detenido en menos de dos segundos.

### 6.2 Degradación segura

Ante la pérdida de comunicación o un heartbeat congelado, el sistema adopta un estado seguro por defecto. El middleware publica todas las salidas en falso con el estado `SIN_CONEXION_PLC`, y la HMI congela toda la cinemática. El criterio es que, en ausencia de información confiable, la representación de la planta no debe sugerir movimiento ni permitir órdenes que dependan de él.

### 6.3 Parada de emergencia

La norma ISO 13850 establece los principios de diseño de la función de parada de emergencia. El dispositivo de mando debe quedar enclavado al accionarse, y su liberación no debe reiniciar la máquina; el rearme exige una acción deliberada e independiente (International Organization for Standardization [ISO], 2015). La norma IEC 60204-1 clasifica las paradas en categorías: la categoría 0 retira inmediatamente la energía de los actuadores, y la 1 los detiene de forma controlada antes de retirarla (IEC, 2016).

El modelo reproduce estos principios en su lógica. La seta es un mando de nivel enclavado (`emergencia` se mantiene hasta liberarla). La transición T1 retira todas las salidas de movimiento en el mismo ciclo, lo que equivale conceptualmente a una parada de categoría 0. Liberar la seta no rearma la línea (CP-10). El rearme exige pulsar Parada (T8) y luego un flanco nuevo de Marcha (P4).

La hipótesis H4 acota el alcance: la emergencia modelada es lógica y didáctica. En una instalación real, la función de parada de emergencia debe implementarse con contactos normalmente cerrados y un circuito de seguridad independiente del programa del PLC.

### 6.4 Inicialización segura tras la reconexión

Cuando el middleware recupera la conexión, el PLC puede haberse reiniciado o puede conservar órdenes antiguas en sus coils. Antes de reanudar la lectura, el middleware escribe los cinco coils de una vez (FC15). Fuerza a 0 los pulsadores y el sensor, y conserva la seta y el selector con el último valor del panel. Así ninguna orden de Marcha retenida provoca un arranque inesperado, y una seta pulsada durante la desconexión llega al PLC en cuanto vuelve, que queda en emergencia.

*Implicación para el diseño:* los tres mecanismos —vigilancia, degradación e inicialización segura— hacen que todo fallo de comunicación termine en un estado sin movimiento y sin órdenes pendientes.

## 7. Interfaz humano-máquina de alto rendimiento

La norma ANSI/ISA-101.01-2015 trata el ciclo de vida de las interfaces humano-máquina, *Human-Machine Interface, HMI,* en la automatización de procesos: su filosofía de diseño, sus guías de estilo y su operación (International Society of Automation [ISA], 2015). En la línea de las interfaces de alto rendimiento que promueve, la HMI del proyecto usa fondos y elementos neutros en gris claro durante la operación normal y reserva el color saturado para las condiciones que exigen atención: rojo para la emergencia y ámbar para la pérdida de comunicación. El objetivo es que una anomalía destaque por contraste y no se confunda con la decoración de la pantalla.

Dos decisiones adicionales responden al mismo propósito de conciencia situacional:

- *Lectura de retorno:* la seta y el selector se muestran según lo que el PLC lee realmente (FC01), no según el último clic del operador. Una orden perdida no queda oculta tras una pantalla que la da por aplicada.
- *Etiquetas de E/S:* cada equipo de la escena muestra su dirección (por ejemplo, `Q0 · %QX0.0`) y su valor en vivo. La planta puede leerse junto a la tabla de mapeo, lo que es útil para la formación.

## 8. Modelo cinemático de la planta

### 8.1 Movimiento en tiempo discreto

La HMI no simula fuerzas ni fricción: modela cada paquete como un punto que avanza sobre un recorrido. El recorrido se describe con una abscisa curvilínea $s$, la distancia recorrida desde el punto de generación. En cada fotograma, de duración $\Delta t$, el paquete avanza a la velocidad nominal de las cintas $v_c$ si el motor de la cinta que tiene debajo está energizado:

$$
s_{k+1} = s_k + v_c \, \Delta t \, m_k, \qquad m_k \in \{0, 1\}
$$

donde $m_k$ es la salida del PLC que acciona esa cinta. Para que un paquete no atraviese al que tiene delante en el mismo carril, su avance se limita por la separación mínima, igual a la longitud $L$ del paquete más un hueco $g$:

$$
s^{(i)}_{k+1} \leq s^{(i-1)}_{k+1} - (L + g)
$$

### 8.2 Detección por cajas alineadas con los ejes

El sensor fotoeléctrico se emula por intersección geométrica. Tanto el haz como cada paquete se representan mediante cajas alineadas con los ejes, *Axis-Aligned Bounding Boxes, AABB*. Dos cajas de este tipo se intersecan si y solo si sus proyecciones se solapan en los tres ejes a la vez (Ericson, 2005):

$$
A \cap B \neq \varnothing \iff \bigwedge_{j \in \{x,y,z\}} \big(A^{min}_j \leq B^{max}_j\big) \land \big(B^{min}_j \leq A^{max}_j\big)
$$

Cuando el paquete gira un ángulo $\theta$ (ruta B, a 45°), su caja alineada se agranda. Para un paquete de largo $L$ y ancho $W$, las semiextensiones en planta son

$$
e_x = \tfrac{1}{2}\big(|\cos\theta|\,L + |\sin\theta|\,W\big), \qquad e_z = \tfrac{1}{2}\big(|\sin\theta|\,L + |\cos\theta|\,W\big)
$$

### 8.3 Condición de no salto

En tiempo discreto, un objeto rápido puede «saltarse» un obstáculo delgado si en un solo paso pasa de un lado a otro sin que ninguna muestra lo encuentre encima. El haz se detecta siempre que el avance por paso sea menor que la longitud del paquete más el espesor del haz $w$:

$$
v_c \, \Delta t < L + w \quad\Rightarrow\quad 0{,}6 \cdot 0{,}25 = 0{,}15 \text{ m} < 0{,}30 + 0{,}01 = 0{,}31 \text{ m}
$$

Esta condición permitiría pasos de hasta 0,5 s, pero la detección no es el único requisito: la planta también debe avanzar al ritmo del temporizador del PLC. Una primera versión recortaba cada fotograma a 0,25 s; en equipos lentos, o en un navegador sin interfaz, los fotogramas más largos hacían que la planta perdiera tiempo frente al PLC, y un paquete quedaba detenido sobre su cinta cuando el PLC ya la había apagado. Por eso cada fotograma se simula ahora en subpasos de $h \leq 0{,}05$ s y solo se recorta el fotograma completo, a 1 s:

$$
h = \frac{\Delta t}{\lceil \Delta t / 0{,}05 \rceil}, \qquad v_c \, h \leq 0{,}6 \cdot 0{,}05 = 0{,}03 \text{ m} \ll L + w = 0{,}31 \text{ m}
$$

Por encima de 1 fotograma por segundo la planta avanza en tiempo real y sin perder detecciones; por debajo, el recorte hace que avance más lento que el temporizador del PLC.

### 8.4 Dimensionamiento del tiempo de clasificación

El PLC no ve el paquete después del sensor: solo cuenta el tiempo $T_{clas}$ desde el flanco. Ese tiempo debe cubrir el *despeje*, es decir, el recorrido desde que el frente del paquete corta el haz hasta que su centro abandona la cinta de salida. Si $s_{sensor}$ es la abscisa del haz y $s_{fin}$ la del extremo de la salida:

$$
t_d = \frac{s_{fin} - \big(s_{sensor} - L/2\big)}{v_c}, \qquad t_d + L_{max} \leq T_{clas}
$$

Con la geometría de la Fase 4 ($v_c = 0{,}6$ m/s, $L_d = 0{,}65$ m, $L_s = 1{,}5$ m), el despeje es de 3,83 s por la ruta A y de 3,75 s por la B. Ambos dejan al menos 0,17 s de margen frente a $T_{clas} = 4$ s, por encima de la latencia de 79 ms de §5.2, de modo que el parámetro del PLC no cambia.

### 8.5 Decisión física de la ruta

La ruta de cada paquete no la decide la HMI a partir del selector, sino la posición física de la paleta en el instante en que el paquete alcanza la bifurcación. Si el PLC no llegó a energizar el desviador a tiempo, o si un segundo paquete llega mientras se clasifica el primero (violación de la hipótesis H1), el paquete sigue la ruta que la paleta le marca. En ese caso se contabiliza como mal clasificado. El modelo reproduce así una consecuencia observable de los errores de control y de temporización, en lugar de ocultarla.

### 8.6 Colocación en la estiba

Al salir de su cinta, cada paquete se lleva a una posición de una retícula de 4 × 4 por capa (`08_especificacion_fase5.md` §2.1). El movimiento se compone de una interpolación suavizada entre el origen y el destino y de un arco vertical. La interpolación usa el polinomio cúbico de Hermite $s(u) = 3u^2 - 2u^3$, que cumple $s(0) = 0$, $s(1) = 1$ y $s'(0) = s'(1) = 0$: el desplazamiento horizontal arranca y termina con velocidad nula. El arco $4u(1-u)$ vale 0 en los extremos y 1 a mitad del vuelo, de modo que eleva el paquete una altura $h$ sobre la recta que une origen y destino:

$$
\mathbf{p}(t) = \mathbf{p}_0 + (\mathbf{p}_1 - \mathbf{p}_0)\, s(u) + h \cdot 4u(1-u)\, \hat{\mathbf{y}}, \qquad u = \frac{t}{T_{col}}
$$

con $T_{col} = 0{,}6$ s y $h = 0{,}25$ m. Como $s'(0) = 0$ mientras el arco crece desde el primer instante, el paquete primero se eleva y después avanza. Las trayectorias reales, obtenidas ejecutando el modelo, están en la Figura 7 de `03_manual_puesta_en_marcha.md`. La colocación es una animación de la planta: el PLC no la observa, porque solo recibe la señal de estiba no disponible cuando la estiba alcanza su capacidad.

## 9. Indicadores de desempeño de la línea

La norma ISO 22400-2 define indicadores clave de desempeño, *Key Performance Indicators, KPI,* para la gestión de operaciones de manufactura: sus fórmulas, unidades y contexto de uso (ISO, 2014). Entre ellos destaca la efectividad global del equipo, *Overall Equipment Effectiveness, OEE,* originada en el mantenimiento productivo total (Nakajima, 1988). La OEE descompone las pérdidas en tres factores independientes: disponibilidad, rendimiento y calidad.

Sea $T_{op}$ el tiempo operativo (la línea en marcha, esperando o clasificando) y $T_{np}$ el tiempo de paros no planificados (emergencia, pérdida de comunicación y, en la Fase 5, espera de cambio de estiba). Sea $N$ el número de paquetes despachados, $N_{ok}$ los correctamente clasificados y $t^*$ el ciclo ideal. Entonces:

$$
D = \frac{T_{op}}{T_{op} + T_{np}}, \qquad R = \frac{N \, t^*}{T_{op}}, \qquad C = \frac{N_{ok}}{N}, \qquad \mathrm{OEE} = D \cdot R \cdot C
$$

El reposo se trata como paro planificado: la línea detenida a voluntad del operador no penaliza la disponibilidad. El ciclo ideal se fija en $t^* = T_{clas} = 4$ s, porque mientras el PLC clasifica un paquete no puede aceptar el siguiente: es el cuello de botella teórico de la línea, con un máximo de 15 paquetes por minuto.

Este marco permite anticipar un resultado. La alimentación automática genera cada paquete un segundo después de que el anterior sale. Su ciclo real es el trayecto desde la generación hasta el sensor, más el despeje, más la espera:

$$
t_{ciclo} \approx \frac{2{,}05}{0{,}6} + 3{,}83 + 1{,}0 \approx 8{,}3 \text{ s} \quad\Rightarrow\quad R \approx \frac{4}{8{,}3} \approx 48\ \%
$$

La pérdida de rendimiento no es un defecto del controlador, sino de la política de alimentación, que espera a que la zona quede libre en lugar de mantener un paquete en cola. La especificación completa de los indicadores está en `08_especificacion_fase5.md`.

## 10. Trazabilidad entre teoría y diseño

| Fundamento | Decisión de diseño | Dónde se materializa |
|---|---|---|
| Clasificación de Kritzinger et al. (2018) | El contrato no supone planta virtual; la señal del sensor llega al PLC por Modbus | `02` §3; `hmi-planta-3d/src/main.js` |
| Puesta en marcha virtual con controlador real | Los `.st` son la fuente de verdad; el mismo protocolo CP corre contra CODESYS y contra el PLC virtual | `plc-codesys/`; `plc-virtual/test/cp.test.js` |
| Ciclo de scan y muestreo | $T_{scan} = 10$ ms; pulsos de 150 ms > $T_{scan} + T_p$ | `GVL_Param`; `PULSE_WIDTH_MS` |
| Tarea cíclica | El PLC virtual programa cada ciclo sobre la marca $k \, T_{scan}$, sin deriva | `plcVirtual.js` |
| Máquina de Moore con $\lambda$ inyectiva | El estado se reconstruye en el middleware con $\lambda^{-1}$ | `dataContract.js` |
| Flanco ascendente | Marcha y sensor por `R_TRIG`; sin rearranque automático (P4) | `FB_ClasificadorFSM` |
| Teorema de muestreo | 20 muestras por periodo de heartbeat | `POLL_INTERVAL_MS = 50` |
| Vigilancia del controlador | $T_{stale} = 3 \cdot PT$ | `HEARTBEAT_STALE_MS = 1500` |
| Degradación segura | Salidas en falso y cinemática congelada sin PLC vivo | `construirEstado`; `main.js` |
| ISO 13850 | Seta enclavada, rearme deliberado, sin rearranque | T1, T8, P4; CP-09 a CP-12 |
| Inicialización segura | FC15 al reconectar conservando seta, selector y estibas | `modbusClient.js` |
| HMI de alto rendimiento (ISA-101) | Fondos neutros, color solo para anomalías, lectura de retorno | `industrial-theme.css`; `operatorPanel.js` |
| AABB y condición de no salto | Sensor emulado por intersección; subpasos de 50 ms y fotograma máximo de 1 s | `plantModel.js`; `main.js`; `sceneManager.js` |
| Interpolación de Hermite | Colocación en la estiba en 0,6 s con arco de 0,25 m | `plantModel.js` (§8.6) |
| Dimensionamiento de $T_{clas}$ | Despeje de 3,83 s y 3,75 s < 4 s; `T#4s` se mantiene | Prueba de geometría en `plantModel.test.js` |
| OEE e ISO 22400-2 | Catálogo de indicadores de la Fase 5 | `08_especificacion_fase5.md` |

---

## Referencias

Ericson, C. (2005). *Real-time collision detection*. Morgan Kaufmann.

Fette, I., & Melnikov, A. (2011). *The WebSocket protocol* (RFC 6455). Internet Engineering Task Force. https://doi.org/10.17487/RFC6455

Grieves, M., & Vickers, J. (2017). Digital twin: Mitigating unpredictable, undesirable emergent behavior in complex systems. En F.-J. Kahlen, S. Flumerfelt, & A. Alves (Eds.), *Transdisciplinary perspectives on complex systems* (pp. 85–113). Springer. https://doi.org/10.1007/978-3-319-38756-7_4

Hopcroft, J. E., Motwani, R., & Ullman, J. D. (2006). *Introduction to automata theory, languages, and computation* (3rd ed.). Pearson.

International Electrotechnical Commission. (2013). *Programmable controllers — Part 3: Programming languages* (IEC Standard No. 61131-3:2013).

International Electrotechnical Commission. (2016). *Safety of machinery — Electrical equipment of machines — Part 1: General requirements* (IEC Standard No. 60204-1:2016).

International Organization for Standardization. (2014). *Automation systems and integration — Key performance indicators (KPIs) for manufacturing operations management — Part 2: Definitions and descriptions* (ISO Standard No. 22400-2:2014).

International Organization for Standardization. (2015). *Safety of machinery — Emergency stop function — Principles for design* (ISO Standard No. 13850:2015).

International Society of Automation. (2015). *Human machine interfaces for process automation systems* (ANSI/ISA-101.01-2015).

John, K.-H., & Tiegelkamp, M. (2010). *IEC 61131-3: Programming industrial automation systems* (2nd ed.). Springer. https://doi.org/10.1007/978-3-642-12015-2

Kritzinger, W., Karner, M., Traar, G., Henjes, J., & Sihn, W. (2018). Digital twin in manufacturing: A categorical literature review and classification. *IFAC-PapersOnLine, 51*(11), 1016–1022. https://doi.org/10.1016/j.ifacol.2018.08.474

Lechler, T., Fischer, E., Metzner, M., Mayr, A., & Franke, J. (2019). Virtual commissioning – Scientific review and exploratory use cases in advanced production systems. *Procedia CIRP, 81*, 1125–1130. https://doi.org/10.1016/j.procir.2019.03.278

Lee, C. G., & Park, S. C. (2014). Survey on the virtual commissioning of manufacturing systems. *Journal of Computational Design and Engineering, 1*(3), 213–222. https://doi.org/10.7315/JCDE.2014.021

Modbus Organization. (2006). *MODBUS messaging on TCP/IP implementation guide V1.0b*. https://modbus.org/specs.php

Modbus Organization. (2012). *MODBUS application protocol specification V1.1b3*. https://modbus.org/specs.php

Moore, E. F. (1956). Gedanken-experiments on sequential machines. En C. E. Shannon & J. McCarthy (Eds.), *Automata studies* (pp. 129–153). Princeton University Press.

Nakajima, S. (1988). *Introduction to TPM: Total productive maintenance*. Productivity Press.

Shannon, C. E. (1949). Communication in the presence of noise. *Proceedings of the IRE, 37*(1), 10–21. https://doi.org/10.1109/JRPROC.1949.232969

Tao, F., Zhang, H., Liu, A., & Nee, A. Y. C. (2019). Digital twin in industry: State-of-the-art. *IEEE Transactions on Industrial Informatics, 15*(4), 2405–2415. https://doi.org/10.1109/TII.2018.2873186
