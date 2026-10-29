// Panel de operador: mando de la planta, estado del sistema, conexiones,
// contadores y registro de eventos. El estado de la seta y del selector se
// muestra desde el readback del PLC (inputs), no desde lo último que se pulsó.

const ESTADOS = {
  SIN_MIDDLEWARE: ['Sin conexión con el middleware', 'aviso'],
  REPOSO: ['Reposo', 'neutro'],
  ESPERANDO_PAQUETE: ['Esperando paquete', 'normal'],
  CLASIFICANDO_RUTA_A: ['Clasificando · ruta A', 'normal'],
  CLASIFICANDO_RUTA_B: ['Clasificando · ruta B', 'normal'],
  PARADA_EMERGENCIA: ['Parada de emergencia', 'alarma'],
  ESPERANDO_CAMBIO_ESTIBA: ['Esperando cambio de estiba', 'aviso'],
  SIN_CONEXION_PLC: ['Sin conexión con el PLC', 'aviso'],
  ESTADO_INDETERMINADO: ['Estado indeterminado', 'aviso'],
};
const MAXIMO_REGISTRO = 6;
const TEXTO_ESTADO_ESTIBA = { disponible: 'disponible', llena: 'llena', cambiando: 'en cambio' };
// Una estiba parcial solo se retira con la línea detenida; una llena, siempre
const ESTADOS_LINEA_DETENIDA = ['REPOSO', 'PARADA_EMERGENCIA', 'ESPERANDO_CAMBIO_ESTIBA', 'SIN_CONEXION_PLC', 'SIN_MIDDLEWARE'];

const plantillaEstiba = (rama) => `
    <div class="estiba">
      <div class="flex items-center justify-between text-xs">
        <span class="font-semibold">Estiba ${rama} · n.º <span data-ref="estiba-${rama}-numero">1</span></span>
        <span data-ref="estiba-${rama}-estado" class="estado-estiba" data-estado="disponible">disponible</span>
      </div>
      <div class="barra"><div data-ref="estiba-${rama}-barra" class="barra-relleno"></div></div>
      <div class="flex items-center justify-between text-xs text-planta-tenue">
        <span data-ref="estiba-${rama}-carga">0 / 12</span>
        <button type="button" data-accion="cambiar-${rama}" class="boton boton-chico">Cambiar estiba ${rama}</button>
      </div>
    </div>`;

const plantilla = ({ vCinta, largoZonaDesvio, largoSalida, despejeA, despejeB, tClasificacion }) => `
<div class="flex flex-col gap-4 p-4 text-sm">
  <header>
    <p class="text-[11px] uppercase tracking-[0.18em] text-planta-tenue">Gemelo digital · SILOGE</p>
    <h1 class="text-base font-semibold">Planta de clasificación</h1>
  </header>

  <section data-ref="estado" class="estado" data-nivel="aviso" aria-live="polite">
    <p class="text-[11px] uppercase tracking-wider opacity-70">Estado del sistema</p>
    <p data-ref="estado-texto" class="text-lg font-semibold">Conectando…</p>
    <p data-ref="estado-codigo" class="font-mono text-[11px] opacity-70">—</p>
  </section>

  <section class="grid grid-cols-2 gap-2 text-xs">
    <div class="indicador"><span data-ref="led-ws" class="led"></span>Middleware</div>
    <div class="indicador"><span data-ref="led-plc" class="led"></span>PLC
      <span data-ref="led-latido" class="led ml-auto" title="Heartbeat %QX0.5"></span></div>
    <p data-ref="ritmo" class="col-span-2 truncate text-planta-tenue">—</p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="titulo-seccion">Mando</h2>
    <div class="grid grid-cols-2 gap-2">
      <button type="button" data-accion="marcha" class="boton boton-marcha">Marcha <kbd>M</kbd></button>
      <button type="button" data-accion="parada" class="boton">Parada <kbd>P</kbd></button>
    </div>
    <button type="button" data-accion="emergencia" class="boton-emergencia" aria-pressed="false">
      <span class="seta" aria-hidden="true"></span>
      <span data-ref="emergencia-texto" class="flex-1 text-left">Emergencia</span><kbd>E</kbd>
    </button>
    <div class="grid grid-cols-2 gap-1 rounded-md border border-planta-borde p-1" role="radiogroup" aria-label="Destino del paquete">
      <button type="button" data-accion="ruta-a" class="selector" role="radio" aria-checked="true">Ruta A <kbd>A</kbd></button>
      <button type="button" data-accion="ruta-b" class="selector" role="radio" aria-checked="false">Ruta B <kbd>B</kbd></button>
    </div>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="titulo-seccion">Planta</h2>
    <button type="button" data-accion="paquete" class="boton">Generar paquete <kbd>Espacio</kbd></button>
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" data-ref="auto" class="accent-planta-tenue"> Alimentación automática (un paquete a la vez)
    </label>
    <dl class="grid grid-cols-3 gap-2 text-center">
      <div class="contador"><dt>Ruta A</dt><dd data-ref="cuenta-a">0</dd></div>
      <div class="contador"><dt>Ruta B</dt><dd data-ref="cuenta-b">0</dd></div>
      <div class="contador" data-ref="caja-error"><dt>Mal clasif.</dt><dd data-ref="cuenta-error">0</dd></div>
    </dl>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="titulo-seccion">Estibas</h2>
    ${plantillaEstiba('A')}
    ${plantillaEstiba('B')}
    <label class="flex items-center justify-between gap-2 text-xs">Capacidad por estiba (paquetes)
      <input type="number" min="1" max="48" step="1" value="12" data-ref="capacidad" class="campo-numero"></label>
    <p class="text-[11px] text-planta-tenue">Rige desde la próxima estiba, o ya si la actual está vacía.
      Completadas: A <span data-ref="completadas-A">0</span> · B <span data-ref="completadas-B">0</span>
      · Desbordes <span data-ref="desbordes">0</span></p>
  </section>

  <section class="flex flex-col gap-1 text-xs text-planta-tenue">
    <h2 class="titulo-seccion">Geometría (Fase 4)</h2>
    <p>v<sub>c</sub> = ${vCinta} m/s · L<sub>d</sub> = ${largoZonaDesvio} m · L<sub>s</sub> = ${largoSalida} m</p>
    <p>Despeje A ${despejeA.toFixed(2)} s · B ${despejeB.toFixed(2)} s &lt; T<sub>clas</sub> = ${tClasificacion} s</p>
  </section>

  <section class="flex flex-col gap-2 text-xs">
    <h2 class="titulo-seccion">Vista</h2>
    <label class="flex items-center gap-2"><input type="checkbox" data-ref="etiquetas" checked class="accent-planta-tenue"> Etiquetas de E/S</label>
    <button type="button" data-accion="vista" class="boton">Reiniciar cámara</button>
  </section>

  <section class="flex flex-col gap-1">
    <h2 class="titulo-seccion">Eventos</h2>
    <ol data-ref="registro" class="flex flex-col gap-1 font-mono text-[11px] text-planta-tenue"></ol>
  </section>
</div>`;

const fijarTexto = (elemento, texto) => {
  if (elemento.textContent !== texto) elemento.textContent = texto;
};
const fijarAtributo = (elemento, nombre, valor) => {
  if (elemento.getAttribute(nombre) !== String(valor)) elemento.setAttribute(nombre, valor);
};

export function crearPanel(contenedor, avisoEscena, opciones) {
  const {
    urlWs, parametros, autoInicial, alOrdenar, alGenerarPaquete, alCambiarEtiquetas, alReiniciarVista,
    alCambiarEstiba, alCambiarCapacidad,
  } = opciones;
  contenedor.innerHTML = plantilla(parametros);
  const ref = (nombre) => contenedor.querySelector(`[data-ref="${nombre}"]`);
  const boton = (accion) => contenedor.querySelector(`[data-accion="${accion}"]`);
  const casillaAuto = ref('auto');
  casillaAuto.checked = autoInicial;

  // Último valor ordenado: se muestra solo mientras no hay readback del PLC
  let emergenciaOrdenada = false;
  let selectorOrdenado = false;
  let vista = { wsConectado: false, estado: null };

  const plcVivo = () => vista.wsConectado && vista.estado?.plcConnected === true;
  const emergenciaActiva = () => (plcVivo() ? vista.estado.inputs.emergencia : emergenciaOrdenada);

  const registrar = (texto, nivel = 'info') => {
    const entrada = document.createElement('li');
    entrada.className = `registro-${nivel}`;
    entrada.textContent = `${new Date().toTimeString().slice(0, 8)}  ${texto}`;
    ref('registro').prepend(entrada);
    while (ref('registro').children.length > MAXIMO_REGISTRO) ref('registro').lastElementChild.remove();
  };

  const ordenar = (comando) => {
    if (!alOrdenar(comando)) registrar('Sin conexión con el middleware: orden no enviada', 'aviso');
  };
  const acciones = {
    marcha: () => ordenar({ target: 'marcha', action: 'pulse' }),
    parada: () => ordenar({ target: 'parada', action: 'pulse' }),
    emergencia: () => {
      emergenciaOrdenada = !emergenciaActiva();
      ordenar({ target: 'emergencia', action: 'set', value: emergenciaOrdenada });
    },
    'ruta-a': () => {
      selectorOrdenado = false;
      ordenar({ target: 'selectorDestinoB', action: 'set', value: false });
    },
    'ruta-b': () => {
      selectorOrdenado = true;
      ordenar({ target: 'selectorDestinoB', action: 'set', value: true });
    },
    paquete: () => alGenerarPaquete(),
    vista: () => alReiniciarVista(),
    'cambiar-A': () => alCambiarEstiba('A'),
    'cambiar-B': () => alCambiarEstiba('B'),
  };
  const ejecutar = (accion) => {
    const elemento = boton(accion);
    if (elemento && !elemento.disabled) acciones[accion]();
  };

  contenedor.addEventListener('click', (evento) => {
    const elemento = evento.target.closest('[data-accion]');
    if (elemento) ejecutar(elemento.dataset.accion);
  });
  ref('etiquetas').addEventListener('change', (evento) => alCambiarEtiquetas(evento.target.checked));
  ref('capacidad').addEventListener('change', (evento) => {
    evento.target.value = alCambiarCapacidad(Number(evento.target.value) || 1);
  });

  const ATAJOS = { m: 'marcha', p: 'parada', e: 'emergencia', a: 'ruta-a', b: 'ruta-b', ' ': 'paquete' };
  window.addEventListener('keydown', (evento) => {
    if (evento.repeat || evento.metaKey || evento.ctrlKey || evento.altKey) return;
    if (evento.target.closest?.('input, textarea, select')) return;
    const accion = ATAJOS[evento.key.toLowerCase()];
    if (!accion) return;
    evento.preventDefault();
    ejecutar(accion);
  });

  return {
    registrar,
    get alimentacionAutomatica() {
      return casillaAuto.checked;
    },
    // Se llama en cada fotograma; solo toca el DOM cuando algo cambia
    mostrar(nuevaVista) {
      vista = nuevaVista;
      const { wsConectado, estado, contadores, hayEspacio, intervaloMs } = vista;
      const vivo = plcVivo();
      const codigo = wsConectado ? (estado?.systemStatus ?? 'SIN_CONEXION_PLC') : 'SIN_MIDDLEWARE';
      const [texto, nivel] = ESTADOS[codigo] ?? [codigo, 'aviso'];
      fijarTexto(ref('estado-texto'), texto);
      fijarTexto(ref('estado-codigo'), codigo);
      fijarAtributo(ref('estado'), 'data-nivel', nivel);

      fijarAtributo(ref('led-ws'), 'data-on', wsConectado ? 'si' : 'falla');
      fijarAtributo(ref('led-plc'), 'data-on', vivo ? 'si' : wsConectado ? 'falla' : 'no');
      fijarAtributo(ref('led-latido'), 'data-on', vivo && estado.heartbeat ? 'si' : 'no');
      fijarTexto(ref('ritmo'), wsConectado && intervaloMs
        ? `Estado cada ≈ ${Math.round(intervaloMs)} ms · ${urlWs}`
        : `Conectando con ${urlWs}…`);

      for (const accion of ['marcha', 'parada', 'ruta-a', 'ruta-b']) boton(accion).disabled = !vivo;
      boton('emergencia').disabled = !wsConectado;
      boton('paquete').disabled = !hayEspacio;

      const emergencia = emergenciaActiva();
      fijarAtributo(boton('emergencia'), 'aria-pressed', emergencia);
      fijarTexto(ref('emergencia-texto'), emergencia ? 'Enclavada · pulsar para liberar' : 'Emergencia');
      const rutaB = vivo ? estado.inputs.selectorDestinoB : selectorOrdenado;
      fijarAtributo(boton('ruta-a'), 'aria-checked', !rutaB);
      fijarAtributo(boton('ruta-b'), 'aria-checked', rutaB);

      fijarTexto(ref('cuenta-a'), String(contadores.A));
      fijarTexto(ref('cuenta-b'), String(contadores.B));
      fijarTexto(ref('cuenta-error'), String(contadores.malClasificados));
      fijarAtributo(ref('caja-error'), 'data-error', contadores.malClasificados > 0);

      for (const [rama, estiba] of Object.entries(vista.estibas)) {
        fijarTexto(ref(`estiba-${rama}-numero`), String(estiba.numero));
        fijarTexto(ref(`estiba-${rama}-carga`), `${estiba.carga} / ${estiba.capacidad}`);
        fijarTexto(ref(`estiba-${rama}-estado`), TEXTO_ESTADO_ESTIBA[estiba.estado]);
        fijarAtributo(ref(`estiba-${rama}-estado`), 'data-estado', estiba.estado);
        fijarAtributo(ref(`estiba-${rama}-barra`), 'style', `width: ${Math.min(100, (100 * estiba.carga) / estiba.capacidad)}%`);
        fijarAtributo(ref(`estiba-${rama}-barra`), 'data-estado', estiba.estado);
        fijarTexto(ref(`completadas-${rama}`), String(contadores.estibasCompletadas[rama]));
        boton(`cambiar-${rama}`).disabled = !estiba.puedeCambiar
          || (estiba.estado !== 'llena' && !ESTADOS_LINEA_DETENIDA.includes(codigo));
      }
      fijarTexto(ref('desbordes'), String(contadores.desbordes));

      const aviso = !wsConectado
        ? `Sin conexión con el middleware (${urlWs}) · reintentando`
        : !vivo ? 'Sin conexión con el PLC · cinemática detenida (degradación segura)'
          : codigo === 'ESPERANDO_CAMBIO_ESTIBA' ? 'Estiba no disponible · cambiarla y pulsar Marcha para continuar' : '';
      fijarTexto(avisoEscena, aviso);
      avisoEscena.hidden = !aviso;
    },
  };
}
