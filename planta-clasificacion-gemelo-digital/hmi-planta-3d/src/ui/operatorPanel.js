// Panel de operador HMI/SCADA (Contrato v1.2.0): mando de la planta, modos de
// ruteo (%MW0), catálogo multiformato de paquetes (Express, Frágil, Estándar, Pesado,
// NO_READ), selector de regla de sorting (Prioridad vs Báscula de Peso), barra de
// Watchdog (%IW6/%MW3), inyección de fallas y monitor de las 4 tablas Modbus.

const ESTADOS = {
  SIN_MIDDLEWARE: ['Sin conexión con el middleware', 'aviso'],
  REPOSO: ['Reposo', 'neutro'],
  ESPERANDO_PAQUETE: ['Esperando paquete', 'normal'],
  CLASIFICANDO_RUTA_A: ['Clasificando · ruta A', 'normal'],
  CLASIFICANDO_RUTA_B: ['Clasificando · ruta B', 'normal'],
  PARADA_EMERGENCIA: ['Parada de emergencia', 'alarma'],
  ESPERANDO_CAMBIO_ESTIBA: ['Esperando cambio de estiba', 'aviso'],
  FALLA_ATASCO: ['Alarma · Atasco en línea (Watchdog)', 'alarma'],
  INSPECCION_NO_READ: ['Inspección · Código NO_READ', 'aviso'],
  SIN_CONEXION_PLC: ['Sin conexión con el PLC', 'aviso'],
  ESTADO_INDETERMINADO: ['Estado indeterminado', 'aviso'],
};

const NOMBRES_FALLA = {
  0: '0 · OK',
  1: '1 · EMERGENCIA',
  2: '2 · ESTIBA_LLENA',
  3: '3 · ATASCO_WATCHDOG',
  4: '4 · CODIGO_NO_READ',
  5: '5 · COHERENCIA_P2_P3',
};

const NOMBRES_SKU = {
  0: '—',
  1: '1 (Estiba A)',
  2: '2 (Estiba B)',
  99: '99 (NO_READ)',
};

const MAXIMO_REGISTRO = 6;
const TEXTO_ESTADO_ESTIBA = { disponible: 'disponible', llena: 'llena', cambiando: 'en cambio' };
const ESTADOS_LINEA_DETENIDA = [
  'REPOSO', 'PARADA_EMERGENCIA', 'ESPERANDO_CAMBIO_ESTIBA',
  'FALLA_ATASCO', 'INSPECCION_NO_READ', 'SIN_CONEXION_PLC', 'SIN_MIDDLEWARE',
];

const plantillaEstiba = (rama) => `
    <div class="estiba">
      <div class="flex items-center justify-between text-xs">
        <span class="font-semibold">Estiba ${rama} · n.º <span data-ref="estiba-${rama}-numero">1</span></span>
        <span data-ref="estiba-${rama}-estado" class="estado-estiba" data-estado="disponible">disponible</span>
      </div>
      <div class="barra"><div data-ref="estiba-${rama}-barra" class="barra-relleno"></div></div>
      <div class="flex items-center justify-between gap-1 text-xs text-planta-tenue">
        <span data-ref="estiba-${rama}-carga">Nivel 0/4 · 0 / 64</span>
        <div class="flex items-center gap-1">
          <button type="button" data-accion="nivel-${rama}" class="boton boton-chico" title="Apilar 1 nivel completo (16 cajas 4×4)">+1 Nivel</button>
          <button type="button" data-accion="cambiar-${rama}" class="boton boton-chico">Cambiar ${rama}</button>
        </div>
      </div>
    </div>`;

const plantilla = ({ vCinta, largoZonaDesvio, largoSalida, despejeA, despejeB, tClasificacion }) => `
<div class="flex flex-col gap-3.5 p-4 text-sm">
  <header>
    <p class="text-[11px] uppercase tracking-[0.18em] text-planta-tenue">Gemelo digital OT · SILOGE</p>
    <h1 class="text-base font-semibold">Celda de clasificación PLC</h1>
  </header>

  <section data-ref="estado" class="estado" data-nivel="aviso" aria-live="polite">
    <div class="flex items-center justify-between">
      <p class="text-[11px] uppercase tracking-wider opacity-70">Estado FSM (%IW0)</p>
      <span data-ref="falla-codigo" class="font-mono text-[10px] opacity-80">0 · OK</span>
    </div>
    <p data-ref="estado-texto" class="text-base font-semibold">Conectando…</p>
    <p data-ref="estado-codigo" class="font-mono text-[11px] opacity-70">—</p>
  </section>

  <section data-ref="caja-noread" hidden class="flex flex-col gap-1.5 rounded-md border border-amber-500 bg-amber-50 p-2.5 text-xs">
    <p class="font-semibold text-amber-900">Código ilegible (NO_READ) en pórtico (%IX0.3)</p>
    <p class="text-[11px] text-amber-800">Asigne manualmente la ruta de salida para reanudar:</p>
    <div class="grid grid-cols-2 gap-1.5">
      <button type="button" data-accion="asignar-noread-a" class="boton boton-chico justify-center">Enviar a Ruta A</button>
      <button type="button" data-accion="asignar-noread-b" class="boton boton-chico justify-center">Enviar a Ruta B</button>
    </div>
  </section>

  <section class="grid grid-cols-2 gap-2 text-xs">
    <div class="indicador"><span data-ref="led-ws" class="led"></span>Middleware</div>
    <div class="indicador"><span data-ref="led-plc" class="led"></span>PLC
      <span data-ref="led-latido" class="led ml-auto" title="Heartbeat %QX0.5"></span></div>
    <p data-ref="ritmo" class="col-span-2 truncate text-planta-tenue">—</p>
  </section>

  <section class="flex flex-col gap-2">
    <h2 class="titulo-seccion">Mando y Ruteo (%MW0)</h2>
    <div class="grid grid-cols-2 gap-2">
      <button type="button" data-accion="marcha" class="boton boton-marcha">Marcha <kbd>M</kbd></button>
      <button type="button" data-accion="parada" class="boton">Parada / Rearme <kbd>P</kbd></button>
    </div>
    <button type="button" data-accion="emergencia" class="boton-emergencia" aria-pressed="false">
      <span class="seta" aria-hidden="true"></span>
      <span data-ref="emergencia-texto" class="flex-1 text-left">Emergencia</span><kbd>E</kbd>
    </button>

    <div class="grid grid-cols-3 gap-1 rounded-md border border-planta-borde p-1 text-xs" role="radiogroup" aria-label="Modo de ruteo PLC">
      <button type="button" data-accion="modo-escaner" class="selector justify-center" role="radio" aria-checked="true">Escáner</button>
      <button type="button" data-accion="modo-balanceo" class="selector justify-center" role="radio" aria-checked="false">Balanceo</button>
      <button type="button" data-accion="modo-manual" class="selector justify-center" role="radio" aria-checked="false">Manual</button>
    </div>

    <div class="grid grid-cols-2 gap-1 rounded-md border border-planta-borde p-1 text-xs" role="radiogroup" aria-label="Criterio de Sorting en Banda">
      <button type="button" data-accion="criterio-prioridad" class="selector justify-center" role="radio" aria-checked="true">Sorting: Prioridad</button>
      <button type="button" data-accion="criterio-peso" class="selector justify-center" role="radio" aria-checked="false">Sorting: Peso (kg)</button>
    </div>

    <div class="grid grid-cols-2 gap-1 rounded-md border border-planta-borde p-1" role="radiogroup" aria-label="Selector manual de destino">
      <button type="button" data-accion="ruta-a" class="selector" role="radio" aria-checked="true">Ruta A <kbd>A</kbd></button>
      <button type="button" data-accion="ruta-b" class="selector" role="radio" aria-checked="false">Ruta B <kbd>B</kbd></button>
    </div>
  </section>

  <section class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <h2 class="titulo-seccion">Catálogo de Paquetes (Sorting)</h2>
      <span data-ref="cola-stopper" class="font-mono text-[11px] text-planta-tenue">Cola: 0 · Stopper OFF</span>
    </div>
    <button type="button" data-accion="paquete" class="boton">Alimentar paquete (Mix 4 tipos) <kbd>Espacio</kbd></button>
    <div class="grid grid-cols-2 gap-1.5 text-xs">
      <button type="button" data-accion="pkg-express" class="boton boton-chico justify-between"><span>📦 Express</span><span class="font-mono text-[10px] opacity-75">3.5kg→A</span></button>
      <button type="button" data-accion="pkg-fragil" class="boton boton-chico justify-between"><span>❄️ Frágil</span><span class="font-mono text-[10px] opacity-75">6.0kg→A</span></button>
      <button type="button" data-accion="pkg-estandar" class="boton boton-chico justify-between"><span>📦 Estándar</span><span class="font-mono text-[10px] opacity-75">11.5kg→B</span></button>
      <button type="button" data-accion="pkg-pesado" class="boton boton-chico justify-between"><span>🏗️ Pesado</span><span class="font-mono text-[10px] opacity-75">18.0kg→B</span></button>
    </div>
    <button type="button" data-accion="paquete-noread" class="boton boton-chico justify-center text-xs">
      ⚠️ Inyectar caja con etiqueta ilegible (NO_READ)
    </button>
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" data-ref="auto" class="accent-planta-tenue"> Alimentación continua (indexada por %QX0.7)
    </label>
    <dl class="grid grid-cols-3 gap-2 text-center">
      <div class="contador"><dt>Ruta A</dt><dd data-ref="cuenta-a">0</dd></div>
      <div class="contador"><dt>Ruta B</dt><dd data-ref="cuenta-b">0</dd></div>
      <div class="contador" data-ref="caja-error"><dt>Mal clasif.</dt><dd data-ref="cuenta-error">0</dd></div>
    </dl>
  </section>

  <section class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <h2 class="titulo-seccion">Watchdog y Fallas OT</h2>
      <span data-ref="watchdog-texto" class="font-mono text-[11px] text-planta-tenue">0 / 4000 ms</span>
    </div>
    <div class="barra"><div data-ref="watchdog-barra" class="barra-relleno"></div></div>
    <button type="button" data-accion="atasco" class="boton text-xs" aria-pressed="false">
      <span data-ref="atasco-texto">Inyectar atasco físico en banda (%IX1.1)</span>
    </button>
    <label class="flex items-center justify-between gap-2 text-xs">Watchdog TON (%MW3, ms)
      <input type="number" min="1500" max="12000" step="500" value="${tClasificacion * 1000}" data-ref="watchdog-ms" class="campo-numero"></label>
  </section>

  <section class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <h2 class="titulo-seccion">Estibas (4 Niveles · 16 cajas/nivel)</h2>
    </div>
    ${plantillaEstiba('A')}
    ${plantillaEstiba('B')}
    <label class="flex items-center justify-between gap-2 text-xs">Capacidad por estiba (paquetes)
      <input type="number" min="1" max="96" step="16" value="64" data-ref="capacidad" class="campo-numero"></label>
    <p class="text-[11px] text-planta-tenue">
      Completadas: A <span data-ref="completadas-A">0</span> · B <span data-ref="completadas-B">0</span>
      · Desbordes <span data-ref="desbordes">0</span></p>
  </section>

  <section class="flex flex-col gap-1.5 rounded-md border border-planta-borde bg-white/60 p-2.5 text-[11px]">
    <h2 class="titulo-seccion">Registros Modbus TCP (FC03 / FC04)</h2>
    <div class="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
      <div>%MW0 Modo: <span data-ref="reg-modo" class="font-semibold">1</span></div>
      <div>%MW1 Escáner: <span data-ref="reg-sku" class="font-semibold">0</span></div>
      <div>%IW2 PLC A: <span data-ref="reg-plca" class="font-semibold">0</span></div>
      <div>%IW3 PLC B: <span data-ref="reg-plcb" class="font-semibold">0</span></div>
      <div>%IW4 Atascos: <span data-ref="reg-atascos" class="font-semibold">0</span></div>
      <div>%IW5 NO_READ: <span data-ref="reg-noread" class="font-semibold">0</span></div>
      <div class="col-span-2">%IW7 Último SKU procesado: <span data-ref="reg-ultimosku" class="font-semibold">—</span></div>
    </div>
  </section>

  <section class="flex flex-col gap-1 text-xs text-planta-tenue">
    <h2 class="titulo-seccion">Cinemática Lazo Cerrado</h2>
    <p>v<sub>c</sub> = ${vCinta} m/s · L<sub>d</sub> = ${largoZonaDesvio} m · L<sub>s</sub> = ${largoSalida} m</p>
    <p>Despeje A ${despejeA.toFixed(2)} s · B ${despejeB.toFixed(2)} s · Sensores %IX0.7 / %IX1.0</p>
  </section>

  <section class="flex flex-col gap-2 text-xs">
    <h2 class="titulo-seccion">Vista</h2>
    <label class="flex items-center gap-2"><input type="checkbox" data-ref="etiquetas" checked class="accent-planta-tenue"> Etiquetas de E/S 3D</label>
    <button type="button" data-accion="vista" class="boton">Reiniciar cámara</button>
  </section>

  <section class="flex flex-col gap-1">
    <h2 class="titulo-seccion">Eventos</h2>
    <ol data-ref="registro" class="flex flex-col gap-1 font-mono text-[11px] text-planta-tenue"></ol>
  </section>
</div>`;

const fijarTexto = (elemento, texto) => {
  if (elemento && elemento.textContent !== texto) elemento.textContent = texto;
};
const fijarAtributo = (elemento, nombre, valor) => {
  if (elemento && elemento.getAttribute(nombre) !== String(valor)) elemento.setAttribute(nombre, valor);
};

export function crearPanel(contenedor, avisoEscena, opciones) {
  const {
    urlWs, parametros, autoInicial, alOrdenar, alGenerarPaquete, alCambiarEtiquetas, alReiniciarVista,
    alCambiarEstiba, alApilarNivelEstiba, alCambiarCapacidad, alCambiarAtasco, alCambiarCriterioSorting,
  } = opciones;
  contenedor.innerHTML = plantilla(parametros);
  const ref = (nombre) => contenedor.querySelector(`[data-ref="${nombre}"]`);
  const boton = (accion) => contenedor.querySelector(`[data-accion="${accion}"]`);
  const casillaAuto = ref('auto');
  casillaAuto.checked = autoInicial;

  let emergenciaOrdenada = false;
  let selectorOrdenado = false;
  let modoRuteoOrdenado = 1;
  let criterioSortingActual = 'prioridad';
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

  const asignarNoRead = (irRutaB) => {
    selectorOrdenado = irRutaB;
    ordenar({ target: 'selectorDestinoB', action: 'set', value: irRutaB });
    setTimeout(() => ordenar({ target: 'marcha', action: 'pulse' }), 40);
    registrar(`Inspección NO_READ: asignado manualmente a Ruta ${irRutaB ? 'B' : 'A'}`);
  };

  const acciones = {
    marcha: () => ordenar({ target: 'marcha', action: 'pulse' }),
    parada: () => ordenar({ target: 'parada', action: 'pulse' }),
    emergencia: () => {
      emergenciaOrdenada = !emergenciaActiva();
      ordenar({ target: 'emergencia', action: 'set', value: emergenciaOrdenada });
    },
    'modo-escaner': () => {
      modoRuteoOrdenado = 1;
      ordenar({ target: 'modoRuteo', action: 'write', value: 1 });
      registrar('Modo PLC: Auto-Escáner (%MW0 = 1)');
    },
    'modo-balanceo': () => {
      modoRuteoOrdenado = 2;
      ordenar({ target: 'modoRuteo', action: 'write', value: 2 });
      registrar('Modo PLC: Auto-Balanceo A/B (%MW0 = 2)');
    },
    'modo-manual': () => {
      modoRuteoOrdenado = 0;
      ordenar({ target: 'modoRuteo', action: 'write', value: 0 });
      registrar('Modo PLC: Selector Manual (%MW0 = 0)');
    },
    'criterio-prioridad': () => {
      criterioSortingActual = 'prioridad';
      alCambiarCriterioSorting?.('prioridad');
    },
    'criterio-peso': () => {
      criterioSortingActual = 'peso';
      alCambiarCriterioSorting?.('peso');
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
    'pkg-express': () => alGenerarPaquete({ tipo: 'express' }),
    'pkg-fragil': () => alGenerarPaquete({ tipo: 'fragil' }),
    'pkg-estandar': () => alGenerarPaquete({ tipo: 'estandar' }),
    'pkg-pesado': () => alGenerarPaquete({ tipo: 'pesado' }),
    'paquete-noread': () => alGenerarPaquete({ tipo: 'noread' }),
    'asignar-noread-a': () => asignarNoRead(false),
    'asignar-noread-b': () => asignarNoRead(true),
    atasco: () => alCambiarAtasco?.(),
    vista: () => alReiniciarVista(),
    'nivel-A': () => alApilarNivelEstiba?.('A'),
    'nivel-B': () => alApilarNivelEstiba?.('B'),
    'cambiar-A': () => alCambiarEstiba('A'),
    'cambiar-B': () => alCambiarEstiba('B'),
  };

  const ejecutar = (accion) => {
    const elemento = boton(accion);
    if (elemento && !elemento.disabled && acciones[accion]) acciones[accion]();
  };

  contenedor.addEventListener('click', (evento) => {
    const elemento = evento.target.closest('[data-accion]');
    if (elemento) ejecutar(elemento.dataset.accion);
  });
  ref('etiquetas').addEventListener('change', (evento) => alCambiarEtiquetas(evento.target.checked));
  ref('capacidad').addEventListener('change', (evento) => {
    evento.target.value = alCambiarCapacidad(Number(evento.target.value) || 1);
  });
  ref('watchdog-ms').addEventListener('change', (evento) => {
    const ms = Math.min(15000, Math.max(1000, Math.round(Number(evento.target.value) || 4000)));
    evento.target.value = ms;
    ordenar({ target: 'tiempoWatchdogMs', action: 'write', value: ms });
    registrar(`Watchdog TON fijado en ${ms} ms (%MW3)`);
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
    mostrar(nuevaVista) {
      vista = nuevaVista;
      const { wsConectado, estado, contadores, hayEspacio, enColaEntrada = 0, atascoActivo = false, intervaloMs } = vista;
      const vivo = plcVivo();
      const codigo = wsConectado ? (estado?.systemStatus ?? 'SIN_CONEXION_PLC') : 'SIN_MIDDLEWARE';
      const [texto, nivel] = ESTADOS[codigo] ?? [codigo, 'aviso'];
      fijarTexto(ref('estado-texto'), texto);
      fijarTexto(ref('estado-codigo'), codigo);
      fijarAtributo(ref('estado'), 'data-nivel', nivel);

      const hr = estado?.holdingRegisters ?? { modoRuteo: modoRuteoOrdenado, skuEscaneado: 0, modoWatchdog: 1, tiempoWatchdogMs: 4000 };
      const ir = estado?.inputRegisters ?? {
        estadoFsm: 0, codigoFalla: 0, paquetesA: 0, paquetesB: 0, atascos: 0, noRead: 0, tiempoClasifMs: 0, ultimoSku: 0,
      };

      fijarTexto(ref('falla-codigo'), NOMBRES_FALLA[ir.codigoFalla] ?? `${ir.codigoFalla}`);
      ref('caja-noread').hidden = codigo !== 'INSPECCION_NO_READ';

      fijarAtributo(ref('led-ws'), 'data-on', wsConectado ? 'si' : 'falla');
      fijarAtributo(ref('led-plc'), 'data-on', vivo ? 'si' : wsConectado ? 'falla' : 'no');
      fijarAtributo(ref('led-latido'), 'data-on', vivo && estado.heartbeat ? 'si' : 'no');
      fijarTexto(ref('ritmo'), wsConectado && intervaloMs
        ? `Ciclo ≈ ${Math.round(intervaloMs)} ms · ${estado?.modo === 'AUTONOMO_PORTAFOLIO' ? 'Web FSM IEC 61131-3' : urlWs}`
        : `Conectando con ${urlWs}…`);

      for (const accion of ['marcha', 'parada', 'ruta-a', 'ruta-b', 'modo-escaner', 'modo-balanceo', 'modo-manual']) {
        boton(accion).disabled = !vivo;
      }
      boton('emergencia').disabled = !wsConectado;
      for (const accion of ['paquete', 'pkg-express', 'pkg-fragil', 'pkg-estandar', 'pkg-pesado', 'paquete-noread']) {
        boton(accion).disabled = !hayEspacio;
      }

      const emergencia = emergenciaActiva();
      fijarAtributo(boton('emergencia'), 'aria-pressed', emergencia);
      fijarTexto(ref('emergencia-texto'), emergencia ? 'Enclavada · pulsar para liberar' : 'Emergencia');

      const modoActual = vivo ? (hr.modoRuteo ?? modoRuteoOrdenado) : modoRuteoOrdenado;
      fijarAtributo(boton('modo-escaner'), 'aria-checked', modoActual === 1);
      fijarAtributo(boton('modo-balanceo'), 'aria-checked', modoActual === 2);
      fijarAtributo(boton('modo-manual'), 'aria-checked', modoActual === 0);

      fijarAtributo(boton('criterio-prioridad'), 'aria-checked', criterioSortingActual === 'prioridad');
      fijarAtributo(boton('criterio-peso'), 'aria-checked', criterioSortingActual === 'peso');

      const rutaB = vivo ? estado.inputs.selectorDestinoB : selectorOrdenado;
      fijarAtributo(boton('ruta-a'), 'aria-checked', !rutaB);
      fijarAtributo(boton('ruta-b'), 'aria-checked', rutaB);

      const stopperOn = Boolean(estado?.outputs?.frenoAdmision);
      fijarTexto(ref('cola-stopper'), `Cola: ${enColaEntrada} · Stopper ${stopperOn ? 'ON' : 'OFF'}`);

      const ptWatchdog = hr.tiempoWatchdogMs || 4000;
      const etWatchdog = ir.tiempoClasifMs || 0;
      fijarTexto(ref('watchdog-texto'), `${etWatchdog} / ${ptWatchdog} ms`);
      const pctWatchdog = Math.min(100, (100 * etWatchdog) / ptWatchdog);
      fijarAtributo(ref('watchdog-barra'), 'style', `width: ${pctWatchdog}%`);
      fijarAtributo(ref('watchdog-barra'), 'data-estado', codigo === 'FALLA_ATASCO' || pctWatchdog > 80 ? 'llena' : 'disponible');

      fijarAtributo(boton('atasco'), 'aria-pressed', atascoActivo);
      fijarTexto(
        ref('atasco-texto'),
        atascoActivo ? 'Atasco activo en banda · Pulsar para despejar' : 'Inyectar atasco físico en banda (%IX1.1)',
      );

      fijarTexto(ref('cuenta-a'), String(contadores.A));
      fijarTexto(ref('cuenta-b'), String(contadores.B));
      fijarTexto(ref('cuenta-error'), String(contadores.malClasificados));
      fijarAtributo(ref('caja-error'), 'data-error', contadores.malClasificados > 0);

      fijarTexto(ref('reg-modo'), `${modoActual} (${modoActual === 1 ? 'ESC' : modoActual === 2 ? 'BAL' : 'MAN'})`);
      fijarTexto(ref('reg-sku'), String(hr.skuEscaneado ?? 0));
      fijarTexto(ref('reg-plca'), String(ir.paquetesA ?? 0));
      fijarTexto(ref('reg-plcb'), String(ir.paquetesB ?? 0));
      fijarTexto(ref('reg-atascos'), String(ir.atascos ?? 0));
      fijarTexto(ref('reg-noread'), String(ir.noRead ?? 0));
      fijarTexto(ref('reg-ultimosku'), NOMBRES_SKU[ir.ultimoSku] ?? String(ir.ultimoSku));

      for (const [rama, estiba] of Object.entries(vista.estibas)) {
        const nivelesTotales = Math.max(1, Math.ceil(estiba.capacidad / 16));
        const nivelActual = estiba.carga === 0 ? 0 : Math.min(nivelesTotales, Math.ceil(estiba.carga / 16));
        fijarTexto(ref(`estiba-${rama}-numero`), String(estiba.numero));
        fijarTexto(ref(`estiba-${rama}-carga`), `Nivel ${nivelActual}/${nivelesTotales} · ${estiba.carga} / ${estiba.capacidad}`);
        fijarTexto(ref(`estiba-${rama}-estado`), TEXTO_ESTADO_ESTIBA[estiba.estado]);
        fijarAtributo(ref(`estiba-${rama}-estado`), 'data-estado', estiba.estado);
        fijarAtributo(ref(`estiba-${rama}-barra`), 'style', `width: ${Math.min(100, (100 * estiba.carga) / estiba.capacidad)}%`);
        fijarAtributo(ref(`estiba-${rama}-barra`), 'data-estado', estiba.estado);
        fijarTexto(ref(`completadas-${rama}`), String(contadores.estibasCompletadas[rama]));
        if (boton(`nivel-${rama}`)) {
          boton(`nivel-${rama}`).disabled = estiba.estado !== 'disponible' || estiba.carga >= estiba.capacidad;
        }
        boton(`cambiar-${rama}`).disabled = !estiba.puedeCambiar
          || (estiba.estado !== 'llena' && !ESTADOS_LINEA_DETENIDA.includes(codigo));
      }
      fijarTexto(ref('desbordes'), String(contadores.desbordes));

      const aviso = !wsConectado
        ? `Sin conexión con el middleware (${urlWs}) · reintentando`
        : !vivo ? 'Sin conexión con el PLC · cinemática detenida (degradación segura)'
          : codigo === 'FALLA_ATASCO' ? 'Alarma de Atasco (Watchdog TON vencido) · Despejar atasco y pulsar Parada para rearmar'
            : codigo === 'INSPECCION_NO_READ' ? 'Pausa de Inspección: código ilegible (NO_READ) · Seleccione Ruta A o B en el panel'
              : codigo === 'ESPERANDO_CAMBIO_ESTIBA' ? 'Estiba no disponible · cambiarla y pulsar Marcha para continuar' : '';
      fijarTexto(avisoEscena, aviso);
      avisoEscena.hidden = !aviso;
    },
  };
}
