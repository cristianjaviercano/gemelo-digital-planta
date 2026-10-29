# 06 · Manual de operación

*Proyecto:* Planta Virtual de Clasificación Gobernada por PLC · *Versión:* 1.0.0 · *Fecha:* 2026-10-23 · *Alcance:* Fases 2 a 4 y estibas de la Fase 5 (los indicadores y el informe CSV se incorporarán al implementarse; su diseño está en `08_especificacion_fase5.md`)

---

## 1. Propósito y destinatarios

El manual describe cómo operar la planta desde la HMI 3D: qué muestra la interfaz, qué significa cada estado del sistema, los procedimientos para cada situación de operación y la respuesta ante avisos y fallos. Se dirige a quienes operan la planta en prácticas y demostraciones, estudiantes y docentes. La instalación y la puesta en marcha técnica se tratan en `03_manual_puesta_en_marcha.md` (macOS) y en `windows/README.md` (laboratorio SILOGE).

## 2. La planta

La planta clasifica paquetes en dos rutas. Una cinta de entrada lleva cada paquete hasta un sensor fotoeléctrico. Al cortarse el haz, el PLC lee el selector de destino. Si el destino es A, el paquete sigue recto hacia la salida A; si es B, una paleta gira 45° y lo guía hacia la salida B. Al final de cada salida, el paquete se coloca en una estiba, en un patrón de 4 × 4 por capa. Cuando una estiba se llena, el PLC detiene la línea hasta que el operador la cambia.

| Equipo | Dirección | Comportamiento |
|---|---|---|
| Cinta de entrada y zona de desvío | Q0 · `%QX0.0` | Se mueven mientras el PLC espera o clasifica |
| Sensor de entrada | I3 · `%IX0.3` | Haz tenue si está libre; intenso si un paquete lo corta. El piloto ámbar del emisor indica lo que lee el PLC |
| Desviador de paleta | Q1 · `%QX0.1` | Paralelo al borde para la ruta A; girado 45° para la ruta B |
| Cinta de salida A | Q2 · `%QX0.2` | Se mueve solo mientras se clasifica hacia A |
| Cinta de salida B | Q3 · `%QX0.3` | Se mueve solo mientras se clasifica hacia B |
| Baliza, módulo rojo | Q4 · `%QX0.4` | Destella a 2 Hz durante la emergencia |
| Baliza, módulo ámbar | Q6 · `%QX0.6` | Destella a 1 Hz mientras se espera el cambio de una estiba |
| Estibas A y B | I5 · `%IX0.5`, I6 · `%IX0.6` | Reciben los paquetes; su sensor avisa al PLC cuando la estiba está llena o en cambio |

La disposición a escala de estos equipos, sus conexiones con el PLC y su identificación sobre la escena 3D se muestran en las figuras 2 a 4 de `03_manual_puesta_en_marcha.md` (sección «Esquema del sistema»).

Cada clasificación dura 4 s, el tiempo que el paquete tarda en despejar la zona y la salida. Mientras dura, el PLC no acepta otro paquete. La planta está diseñada para *un paquete a la vez* (hipótesis H1).

## 3. La interfaz

### 3.1 Escena 3D

- *Navegación:* arrastrar para orbitar, rueda para acercar y alejar, clic derecho para desplazar. «Reiniciar cámara» recupera la vista inicial.
- *Etiquetas de E/S:* sobre cada equipo aparece su dirección, su nombre y su valor en vivo (`ON`, `OFF`, `→ ruta A`, `ALARMA`). Sin datos del PLC muestran «sin dato». Se ocultan desde la casilla «Etiquetas de E/S».
- *Banda de aviso:* aparece en la parte superior de la escena cuando falta la conexión con el middleware o con el PLC.

### 3.2 Panel de operador

| Sección | Contenido |
|---|---|
| Estado del sistema | Nombre y código del estado actual, con el color de §4 |
| Conexiones | Pilotos de middleware y PLC (verde en línea, ámbar sin conexión), piloto del heartbeat y frecuencia de actualización |
| Mando | Marcha, Parada, Emergencia y selector de Ruta A / Ruta B |
| Planta | Generar paquete, alimentación automática y contadores de ruta A, ruta B y mal clasificados |
| Estibas | Por estiba: número, carga frente a capacidad, estado (disponible, llena o en cambio) y botón «Cambiar estiba»; capacidad por estiba (1 a 48), estibas completadas y desbordes |
| Geometría | Parámetros de la planta y tiempos de despeje frente a los 4 s del PLC |
| Vista | Etiquetas de E/S y reinicio de cámara |
| Eventos | Últimos seis eventos, con hora; en ámbar los avisos y en rojo las alarmas |

Reglas de habilitación de los mandos:

- *Marcha, Parada y el selector:* solo funcionan con el PLC en línea.
- *Emergencia:* funciona con el middleware conectado, aunque el PLC no lo esté. El middleware la conserva y la aplica en cuanto el PLC vuelve.
- *Generar paquete:* se deshabilita mientras el inicio de la cinta de entrada está ocupado.
- *Cambiar estiba:* se habilita si la estiba tiene carga, no hay un paquete en vuelo hacia ella y, además, está llena o la línea está detenida (Reposo, emergencia, espera de cambio o sin conexión).

La seta y el selector muestran lo que *el PLC lee*, no el último clic. Si una orden no llega, la pantalla no la da por aplicada.

### 3.3 Atajos de teclado

| Tecla | Acción |
|:-:|---|
| M | Marcha |
| P | Parada |
| E | Emergencia (pulsar de nuevo para liberarla) |
| A / B | Destino ruta A / ruta B |
| Espacio | Generar paquete |

## 4. Estados del sistema

| Estado | Color del panel | Qué se ve en la planta | Qué puede hacer el operador |
|---|---|---|---|
| `REPOSO` | Gris | Todo detenido | Elegir destino y pulsar Marcha |
| `ESPERANDO_PAQUETE` | Gris con borde verde | Cinta de entrada en movimiento | Generar paquetes, cambiar destino, pulsar Parada |
| `CLASIFICANDO_RUTA_A` | Gris con borde verde | Entrada y salida A en movimiento; paleta en A | Esperar unos 4 s; Parada detiene la clasificación |
| `CLASIFICANDO_RUTA_B` | Gris con borde verde | Entrada y salida B en movimiento; paleta en B | Igual que en la ruta A |
| `PARADA_EMERGENCIA` | Rojo destellante | Todo detenido; baliza roja | Liberar la seta y pulsar Parada para rearmar |
| `ESPERANDO_CAMBIO_ESTIBA` | Ámbar | Todo detenido; baliza ámbar; banda «Estiba no disponible · cambiarla y pulsar Marcha para continuar» | Cambiar la estiba (POE-09) y pulsar Marcha |
| `SIN_CONEXION_PLC` | Ámbar | Escena congelada; banda de aviso | Restablecer el PLC (§6) |
| `ESTADO_INDETERMINADO` | Ámbar | Salidas incoherentes del PLC | Detener la práctica y revisar el programa del PLC |
| Sin conexión con el middleware | Ámbar | Escena congelada; banda de aviso | Restablecer el middleware (§6) |

## 5. Procedimientos de operación

### POE-01 · Arranque de la planta

*Objetivo:* dejar las tres capas en marcha y la HMI conectada.

1. En macOS, abrir con doble clic «Planta de Clasificación.app», en la carpeta del proyecto (equivale a `./iniciar.sh`). Si la planta ya estaba en marcha, el lanzador lo avisa y no abre otra; se sigue usando la pestaña existente. En el laboratorio, seguir `windows/README.md` §3–5.
2. Abrir http://localhost:5173 si el navegador no se abre solo.
3. Comprobar los pilotos de middleware y PLC en verde, el heartbeat parpadeando y el estado «Reposo».

*Resultado esperado:* estado `REPOSO`, sin banda de aviso y con el evento «PLC en línea» en el registro.

### POE-02 · Puesta en marcha de la línea

*Precondición:* estado `REPOSO`, seta liberada.

1. Elegir el destino con «Ruta A» o «Ruta B».
2. Pulsar «Marcha».

*Resultado esperado:* estado «Esperando paquete» y la cinta de entrada en movimiento.

### POE-03 · Alimentación de paquetes

*Precondición:* estado «Esperando paquete».

- *Manual:* pulsar «Generar paquete» (o Espacio) y esperar a que el paquete se despache antes de generar el siguiente.
- *Automática:* activar «Alimentación automática». La HMI genera un paquete un segundo después de que el anterior sale de las cintas, siempre uno a la vez.

*Resultado esperado:* el paquete corta el haz, el estado pasa a «Clasificando · ruta X», la paleta se orienta, el paquete se coloca en la siguiente posición libre de su estiba y el contador de su ruta aumenta. Unos 4 s después del corte del haz, el estado vuelve a «Esperando paquete».

*Precaución:* dos paquetes demasiado próximos violan la hipótesis H1. El PLC ignora el segundo porque aún clasifica el primero, y ese paquete puede terminar en la ruta equivocada o quedar detenido en una salida. Se contabiliza como mal clasificado y se pinta de rojo.

### POE-04 · Cambio de destino

1. Pulsar «Ruta A» o «Ruta B» con la línea en «Esperando paquete».

El destino se fija en el instante en que el paquete corta el haz. Cambiarlo durante una clasificación no afecta al paquete en curso (propiedad P5); se aplica al siguiente.

### POE-05 · Parada normal

1. Pulsar «Parada».

*Resultado esperado:* estado `REPOSO` y todas las cintas detenidas en el mismo instante. Si la parada ocurre durante una clasificación, el paquete queda donde estaba. Al volver a pulsar Marcha, la entrada se reanuda. Un paquete que haya llegado a una salida queda en ella hasta la siguiente clasificación por esa ruta, porque las salidas solo se mueven mientras se clasifica.

### POE-06 · Parada de emergencia y rearme

1. Pulsar «Emergencia» (o E). La seta queda enclavada: el botón muestra «Enclavada · pulsar para liberar».
2. Comprobar el estado «Parada de emergencia», la baliza roja destellando y todo detenido.
3. Resolver la causa que motivó la parada.
4. Liberar la seta pulsando de nuevo «Emergencia». El estado no cambia: liberar la seta *no rearma* la línea.
5. Pulsar «Parada» para rearmar. El estado pasa a «Reposo».
6. Pulsar «Marcha» para reanudar.

Si «Marcha» estaba pulsada durante la emergencia, la línea no arranca sola tras el rearme: hace falta pulsarla de nuevo (propiedad P4).

### POE-07 · Pérdida de comunicación

*Síntoma:* banda ámbar en la escena y estado «Sin conexión con el PLC» o «Sin conexión con el middleware». La escena queda congelada a propósito: sin datos confiables no se representa movimiento.

1. No intentar operar: los mandos están deshabilitados, salvo la emergencia.
2. Identificar la capa caída con los pilotos de conexión.
3. Restablecerla (§7). Middleware y HMI se reconectan solos, sin recargar la página.
4. Tras la reconexión, comprobar el estado. Si la seta estaba pulsada, el PLC vuelve en emergencia y se aplica POE-06. En cualquier otro caso vuelve en Reposo y se aplica POE-02.

### POE-08 · Fin de la jornada

1. Pulsar «Parada» y esperar a que la planta quede en Reposo.
2. Si se desea, retirar las estibas parciales (POE-09); quedan registradas como parciales.
3. En macOS, pulsar Ctrl+C en la ventana de Terminal que abrió el lanzador, o cerrarla; las tres capas se detienen. En el laboratorio, cerrar las ventanas del middleware y de la HMI y detener CODESYS.

### POE-09 · Cambio de estiba

*Cuándo:* una estiba se llenó (estado «Esperando cambio de estiba» y baliza ámbar) o se quiere retirar una estiba parcial con la línea detenida.

1. Esperar a que el botón «Cambiar estiba X» esté habilitado: no se habilita mientras un paquete vuela hacia la estiba.
2. Pulsarlo. Durante 3 s la estiba cargada se retira en el sentido de su ruta y entra una vacía por el costado.
3. Esperar el evento «Estiba X vacía en posición». Si la otra estiba está disponible, el estado pasa a «Reposo».
4. Pulsar «Marcha» para reanudar (POE-02). La línea nunca arranca sola tras un cambio.

*Resultado esperado:* el evento «Estiba X n.º N retirada: U paquetes» registra la salida, con «(parcial)» si no estaba llena, y el contador de estibas completadas aumenta si lo estaba.

*Capacidad:* se ajusta en «Capacidad por estiba» (1 a 48 paquetes). Rige desde la próxima estiba, o de inmediato si la actual está vacía.

## 6. Avisos y alarmas

| Aviso | Causa probable | Respuesta |
|---|---|---|
| Estado rojo «Parada de emergencia» | Seta pulsada | POE-06 |
| Banda «Sin conexión con el PLC · cinemática detenida» | PLC detenido o caído, o puerto mal configurado | POE-07 y §7 |
| Banda «Sin conexión con el middleware · reintentando» | Middleware detenido o dirección incorrecta | POE-07 y §7 |
| Evento «Orden … rechazada: PLC_DESCONECTADO» | Orden enviada sin PLC | Esperar la reconexión |
| Evento «Orden … rechazada: TARGET_NO_PERMITIDO» u otro código | Orden fuera de la lista blanca | Solo ocurre con clientes de prueba; no se origina desde el panel |
| Evento rojo «Paquete … se esperaba …» | Paquete mal clasificado | Revisar la separación entre paquetes (POE-03) |
| Evento «Entrada ocupada» | Se pidió un paquete con el inicio de la entrada ocupado | Esperar a que el paquete avance |
| Estado ámbar «Esperando cambio de estiba», baliza ámbar y evento «Estiba X llena: el PLC detiene la línea» | La estiba alcanzó su capacidad | POE-09 |
| Evento ámbar «Paquete … al suelo: estiba X no disponible» | Un paquete llegó a una estiba llena o en cambio | Cambiar la estiba (POE-09); el contador de desbordes lo registra |
| Evento ámbar «La estiba X no se puede cambiar ahora» | Estiba sin carga, ya en cambio o con un paquete en vuelo | Esperar a que el paquete se deposite |

## 7. Solución de problemas

| Síntoma | Causa | Solución |
|---|---|---|
| `iniciar.sh` indica «Falta instalar dependencias» | No se ejecutó `npm install` | `npm install` en la carpeta indicada |
| Error de puerto en uso (5020, 8080 o 5173) | Quedó una instancia anterior abierta | `lsof -i :<puerto>` para identificarla y cerrarla |
| Banda «Sin conexión con el PLC» de forma permanente | En macOS, `MODBUS_PORT` distinto de 5020; en el laboratorio, distinto de 502 o CODESYS sin iniciar | Revisar `puente-modbus-planta/.env`; en CODESYS, iniciar sesión y pulsar Inicio (F5) |
| Banda «Sin conexión con el middleware» | Middleware detenido, o HMI abierta desde otro equipo sin `WS_HOST=0.0.0.0` | Arrancar el middleware; en red, ver `windows/README.md` §5 |
| La planta avanza a saltos o más lenta que el PLC | Pestaña en segundo plano o equipo con poca capacidad gráfica (con pocos fotogramas por segundo avanza a saltos; por debajo de 1 se retrasa frente al PLC) | Mantener la pestaña visible y cerrar aplicaciones pesadas |
| Paquetes mal clasificados sin causa aparente | Dos HMI abiertas: cada una emula su propio sensor | Dejar una sola pestaña de la HMI |
| Página sin escena 3D | Navegador sin WebGL 2 | Actualizar Chrome, Edge, Firefox o Safari |
| Un paquete queda detenido en una salida | Parada durante una clasificación (POE-05) o violación de H1 | Clasificar otro paquete por esa ruta, o reiniciar la planta |

## 8. Herramientas complementarias

- *Consola de texto:* `cd puente-modbus-planta && npm run consola` permite operar la planta desde el teclado sin la vista 3D (m, p, e1/e0, s1/s0, a/b, la1/la0 y lb1/lb0 para las estibas, q).
- *Demostración narrada:* `npm run demo` en la misma carpeta recorre en unos 10 s rutas, emergencia, STOP del PLC y caída con reconexión, indicando qué ocurre en cada capa.
- *STOP del PLC:* con el PLC virtual en su propia terminal (`cd plc-virtual && npm start`), escribir `stop` congela su programa y `run` lo reanuda. Sirve para observar la vigilancia del heartbeat: a los 1,5 s el sistema pasa a «Sin conexión con el PLC».
