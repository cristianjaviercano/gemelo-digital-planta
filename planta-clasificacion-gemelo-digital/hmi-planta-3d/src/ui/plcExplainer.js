// Visualizador didáctico "Rayos X del PLC" + Barra de KPIs Ejecutivos B2B:
// Explica en lenguaje sencillo y con animación en tiempo real el ciclo Scan del
// PLC (1. Leer Sensores → 2. Evaluar Regla → 3. Activar Actuadores) junto con
// 3 renglones de Lógica de Escalera (Ladder) que se iluminan cuando conducen.

const EXPLICACION_DIDACTICA = {
  SIN_MIDDLEWARE: {
    titulo: 'Esperando conexión…',
    explicacion: 'El navegador está conectando con el controlador PLC para leer sensores y motores.',
    pasoActivo: 0,
  },
  SIN_CONEXION_PLC: {
    titulo: 'PLC detenido o desconectado (Seguridad activa)',
    explicacion: 'El latido (Heartbeat) del PLC se detuvo. Por seguridad industrial, todas las bandas se apagan automáticamente.',
    pasoActivo: 0,
  },
  REPOSO: {
    titulo: 'Planta en Reposo Seguro (S0)',
    explicacion: 'Todos los motores están apagados (0 V). El PLC revisa 100 veces por segundo si el operador pulsa el botón verde [Marcha].',
    pasoActivo: 1,
  },
  ESPERANDO_PAQUETE: {
    titulo: 'Banda en Marcha · Esperando Paquete en el Escáner (S1)',
    explicacion: 'El motor principal (Q0) mueve la cinta y el freno de cola (Q7) está abajo. El PLC vigila el haz láser de entrada (%IX0.3) esperando que una caja lo corte.',
    pasoActivo: 1,
  },
  CLASIFICANDO_RUTA_A: {
    titulo: 'Sorting Activo → Despachando hacia Estiba A (S2)',
    explicacion: '¡Caja rumbo a Estiba A! El PLC mantiene recto el desviador (0°), enciende la Banda A (Q2), levanta el freno (Q7) para retener la fila detrás y espera confirmación del sensor final A (%IX0.7).',
    pasoActivo: 3,
  },
  CLASIFICANDO_RUTA_B: {
    titulo: 'Sorting Activo → Desviando 45° hacia Estiba B (S3)',
    explicacion: '¡Caja rumbo a Estiba B! El PLC activa el pistón neumático a 45° (Q1), enciende la Banda B (Q3), sube el freno (Q7) para dosificar la fila y espera que la caja cruce el sensor final B (%IX1.0).',
    pasoActivo: 3,
  },
  PARADA_EMERGENCIA: {
    titulo: '¡Parada de Emergencia Enclavada! (S4 · Norma ISO 13849-1)',
    explicacion: 'La seta roja cortó inmediatamente la energía de todos los motores y encendió la sirena roja. Aunque sueltes la seta, la máquina NO arranca sola: exige pulsar [Parada/Rearme] y luego [Marcha].',
    pasoActivo: 2,
  },
  ESPERANDO_CAMBIO_ESTIBA: {
    titulo: 'Línea Pausada por Estiba Llena (S5)',
    explicacion: 'Una estiba alcanzó su capacidad máxima. El PLC detuvo las cintas y encendió la luz ámbar para que el montacargas retire la estiba llena sin que caigan cajas al suelo.',
    pasoActivo: 2,
  },
  FALLA_ATASCO: {
    titulo: '¡Alarma de Watchdog! Paquete Atascado en Banda (S6)',
    explicacion: 'El cronómetro del PLC (Watchdog TON) llegó al límite sin que el paquete tocara el sensor de salida. El PLC detectó el atasco, frenó los motores para protegerlos y espera que despejes la caja.',
    pasoActivo: 2,
  },
  INSPECCION_NO_READ: {
    titulo: 'Pausa de Inspección · Etiqueta Ilegible NO_READ (S7)',
    explicacion: 'El pórtico láser no pudo leer el código de barras (código 99). El PLC detuvo la caja justo en la estación y encendió la luz ámbar para que tú elijas manualmente si va a Ruta A o Ruta B.',
    pasoActivo: 2,
  },
};

const plantilla = () => `
  <!-- Barra superior de KPIs Ejecutivos B2B -->
  <div class="kpis-ejecutivos" aria-label="Indicadores ejecutivos de planta">
    <div class="kpi-pill">
      <span class="kpi-label">Capacidad</span>
      <span data-ref="kpi-rate" class="kpi-val">1020 cajas/h</span>
    </div>
    <div class="kpi-pill">
      <span class="kpi-label">Carga despachada</span>
      <span data-ref="kpi-peso" class="kpi-val">0.0 kg</span>
    </div>
    <div class="kpi-pill">
      <span class="kpi-label">Calidad Sorting (OEE)</span>
      <span data-ref="kpi-oee" class="kpi-val">100%</span>
    </div>
    <div class="kpi-pill hidden sm:flex">
      <span class="kpi-label">Regla activa</span>
      <span data-ref="kpi-regla" class="kpi-val">Prioridad / Tipo</span>
    </div>
  </div>

  <!-- Gaveta didáctica inferior: Rayos X del PLC -->
  <section data-ref="gaveta" class="plc-explainer" data-abierto="si" aria-label="Cómo funciona el PLC en vivo">
    <div class="plc-explainer-header">
      <div class="flex items-center gap-2">
        <span class="plc-badge">RAYOS X DEL PLC · CICLO SCAN 10 ms</span>
        <strong data-ref="exp-titulo" class="text-xs sm:text-sm font-semibold">Planta en Reposo Seguro (S0)</strong>
      </div>
      <button type="button" data-ref="btn-toggle" class="boton boton-chico">
        <span data-ref="txt-toggle">Ocultar explicación PLC</span>
      </button>
    </div>

    <div data-ref="cuerpo" class="plc-explainer-body">
      <p data-ref="exp-texto" class="plc-explicacion-humana">
        Todos los motores están apagados. El PLC revisa 100 veces por segundo si el operador pulsa Marcha.
      </p>

      <div class="plc-grid">
        <!-- 1. Los 3 pasos del ciclo del PLC -->
        <div class="plc-pasos">
          <div data-ref="paso-1" class="plc-paso" data-activo="no">
            <div class="plc-paso-num">1 · LEER SENSORES (%IX)</div>
            <div class="plc-chips">
              <span data-ref="chip-sensor-in" class="plc-chip">Escáner %IX0.3: Libre</span>
              <span data-ref="chip-sku" class="plc-chip">Lectura: —</span>
              <span data-ref="chip-sensor-out" class="plc-chip">Salida A/B: Libre</span>
            </div>
          </div>

          <div class="plc-flecha" aria-hidden="true">➜</div>

          <div data-ref="paso-2" class="plc-paso" data-activo="si">
            <div class="plc-paso-num">2 · PENSAR / DECIDIR (FSM)</div>
            <div class="plc-chips">
              <span data-ref="chip-estado" class="plc-chip" data-on="si">Estado: REPOSO</span>
              <span data-ref="chip-regla" class="plc-chip">Regla: Auto-Escáner</span>
              <span data-ref="chip-timer" class="plc-chip">Cronómetro: 0.0 / 4.0 s</span>
            </div>
          </div>

          <div class="plc-flecha" aria-hidden="true">➜</div>

          <div data-ref="paso-3" class="plc-paso" data-activo="no">
            <div class="plc-paso-num">3 · MOVER MÁQUINAS (%QX)</div>
            <div class="plc-chips">
              <span data-ref="chip-q0" class="plc-chip">Motor Banda Q0</span>
              <span data-ref="chip-q1" class="plc-chip">Pistón 45° Q1</span>
              <span data-ref="chip-q23" class="plc-chip">Salida A/B</span>
              <span data-ref="chip-q7" class="plc-chip">Freno Cola Q7</span>
            </div>
          </div>
        </div>

        <!-- 2. Lógica de Escalera (Ladder) básica en vivo -->
        <div class="plc-ladder" aria-label="Diagrama de escalera simplificado">
          <div class="plc-ladder-titulo">Lógica de Escalera (Ladder) en vivo · Verde = Pasa energía 24V</div>

          <div data-ref="rung-1" class="ladder-rung" data-conduce="no">
            <span class="ladder-num">R1</span>
            <span data-ref="c-marcha" class="ladder-contact" title="Marcha o retención en ciclo">[ Marcha/Ciclo ]</span>
            <span class="ladder-wire">──</span>
            <span data-ref="c-no-emerg" class="ladder-contact" title="Contacto cerrado: sin emergencia">[/Emergencia]</span>
            <span class="ladder-wire">──</span>
            <span data-ref="c-no-llena" class="ladder-contact" title="Contacto cerrado: estibas disponibles">[/Estiba Llena]</span>
            <span class="ladder-wire">──►</span>
            <span data-ref="b-q0" class="ladder-coil">( Motor Banda Q0 )</span>
          </div>

          <div data-ref="rung-2" class="ladder-rung" data-conduce="no">
            <span class="ladder-num">R2</span>
            <span data-ref="c-sensor" class="ladder-contact" title="Paquete detectado en escáner">[ Sensor %IX0.3 ]</span>
            <span class="ladder-wire">──</span>
            <span data-ref="c-rutab" class="ladder-contact" title="Decisión de sorting hacia Estiba B">[ Destino = B ]</span>
            <span class="ladder-wire">──────────────►</span>
            <span data-ref="b-q1" class="ladder-coil">( Pistón 45° Q1 + Salida B )</span>
          </div>

          <div data-ref="rung-3" class="ladder-rung" data-conduce="no">
            <span class="ladder-num">R3</span>
            <span data-ref="c-clasif" class="ladder-contact" title="Paquete en zona de desvío">[ Clasificando ]</span>
            <span class="ladder-wire">──</span>
            <span data-ref="c-no-salida" class="ladder-contact" title="Aún no cruza fotocelda final">[/Sensor Salida]</span>
            <span class="ladder-wire">──────────────►</span>
            <span data-ref="b-q7" class="ladder-coil">( Freno Cola Q7 + TON )</span>
          </div>
        </div>
      </div>
    </div>
  </section>
`;

const fijarTexto = (el, txt) => {
  if (el && el.textContent !== txt) el.textContent = txt;
};
const fijarAttr = (el, attr, val) => {
  if (el && el.getAttribute(attr) !== String(val)) el.setAttribute(attr, val);
};

export function crearExplicadorPLC(contenedorEscena) {
  const envoltorio = document.createElement('div');
  envoltorio.innerHTML = plantilla();
  while (envoltorio.firstElementChild) {
    contenedorEscena.appendChild(envoltorio.firstElementChild);
  }

  const ref = (nombre) => contenedorEscena.querySelector(`[data-ref="${nombre}"]`);
  const gaveta = ref('gaveta');
  const cuerpo = ref('cuerpo');
  let abierto = true;

  ref('btn-toggle').addEventListener('click', () => {
    abierto = !abierto;
    fijarAttr(gaveta, 'data-abierto', abierto ? 'si' : 'no');
    cuerpo.hidden = !abierto;
    fijarTexto(ref('txt-toggle'), abierto ? 'Ocultar explicación PLC' : '🔬 Ver cómo piensa el PLC');
  });

  return {
    actualizar({ estado, contadores, criterioSorting, umbralPesoKg, ultimoEscaneo }) {
      const codigo = estado?.systemStatus ?? 'SIN_MIDDLEWARE';
      const info = EXPLICACION_DIDACTICA[codigo] ?? EXPLICACION_DIDACTICA.REPOSO;

      fijarTexto(ref('exp-titulo'), info.titulo);
      fijarTexto(ref('exp-texto'), info.explicacion);

      const inputs = estado?.inputs ?? {};
      const outputs = estado?.outputs ?? {};
      const hr = estado?.holdingRegisters ?? { modoRuteo: 1, skuEscaneado: 0, tiempoWatchdogMs: 4000 };
      const ir = estado?.inputRegisters ?? { tiempoClasifMs: 0, ultimoSku: 0 };

      // 1. KPIs Ejecutivos B2B
      const totalDespachados = (contadores?.A ?? 0) + (contadores?.B ?? 0);
      const errores = (contadores?.malClasificados ?? 0) + (contadores?.desbordes ?? 0);
      const oee = totalDespachados > 0
        ? Math.max(0, Math.round((100 * (totalDespachados - errores)) / totalDespachados))
        : 100;
      const pesoTotal = contadores?.pesoDespachadoKg?.total ?? 0;
      // En cierre de lazo (~3.35s por caja) la capacidad efectiva es ~1070 cajas/h; en lazo abierto (4.0s) es 900 cajas/h
      const capacidadHora = outputs.cintaEntrada ? 1050 : 900;
      fijarTexto(ref('kpi-rate'), `${capacidadHora} cajas/h`);
      fijarTexto(ref('kpi-peso'), `${pesoTotal.toFixed(1)} kg (A:${(contadores?.pesoDespachadoKg?.A ?? 0).toFixed(0)} · B:${(contadores?.pesoDespachadoKg?.B ?? 0).toFixed(0)})`);
      fijarTexto(ref('kpi-oee'), `${oee}%`);
      const txtRegla = hr.modoRuteo === 2
        ? 'Balanceo 50/50'
        : hr.modoRuteo === 0
          ? 'Manual Operador'
          : criterioSorting === 'peso'
            ? `Báscula (<${umbralPesoKg}kg→A)`
            : 'Prioridad / Tipo';
      fijarTexto(ref('kpi-regla'), txtRegla);

      if (!abierto) return;

      // 2. Animación de los 3 pasos del Ciclo Scan
      const sensorInActivo = Boolean(inputs.sensorEntrada);
      const salidaActiva = Boolean(inputs.sensorSalidaA || inputs.sensorSalidaB);
      fijarAttr(ref('paso-1'), 'data-activo', sensorInActivo || salidaActiva ? 'si' : 'no');
      fijarAttr(ref('paso-2'), 'data-activo', 'si');
      fijarAttr(ref('paso-3'), 'data-activo', outputs.cintaEntrada || outputs.balizaAlarma || outputs.senalCambioEstiba ? 'si' : 'no');

      fijarTexto(ref('chip-sensor-in'), `Escáner %IX0.3: ${sensorInActivo ? 'DETECTANDO CAJA' : 'Libre'}`);
      fijarAttr(ref('chip-sensor-in'), 'data-on', sensorInActivo ? 'si' : 'no');

      const txtUltimo = ultimoEscaneo
        ? `${ultimoEscaneo.etiqueta} → ${ultimoEscaneo.sku === 99 ? 'NO_READ' : `Estiba ${ultimoEscaneo.sku === 2 ? 'B' : 'A'}`}`
        : 'Sin lectura aún';
      fijarTexto(ref('chip-sku'), txtUltimo);
      fijarAttr(ref('chip-sku'), 'data-on', ultimoEscaneo ? 'si' : 'no');

      const txtSalida = inputs.sensorSalidaA
        ? 'Salida A (%IX0.7): ¡Confirmada!'
        : inputs.sensorSalidaB
          ? 'Salida B (%IX1.0): ¡Confirmada!'
          : 'Sensores Salida A/B: Libres';
      fijarTexto(ref('chip-sensor-out'), txtSalida);
      fijarAttr(ref('chip-sensor-out'), 'data-on', salidaActiva ? 'si' : 'no');

      fijarTexto(ref('chip-estado'), `Estado: ${codigo}`);
      fijarTexto(ref('chip-regla'), `Modo: ${txtRegla}`);
      const etSeg = ((ir.tiempoClasifMs ?? 0) / 1000).toFixed(1);
      const ptSeg = ((hr.tiempoWatchdogMs ?? 4000) / 1000).toFixed(1);
      fijarTexto(ref('chip-timer'), `Watchdog: ${etSeg} / ${ptSeg} s`);
      fijarAttr(ref('chip-timer'), 'data-on', (ir.tiempoClasifMs ?? 0) > 0 ? 'si' : 'no');

      fijarAttr(ref('chip-q0'), 'data-on', outputs.cintaEntrada ? 'si' : 'no');
      fijarAttr(ref('chip-q1'), 'data-on', outputs.desviadorActivo ? 'si' : 'no');
      fijarTexto(
        ref('chip-q23'),
        outputs.cintaSalidaA ? 'Banda Salida A ON' : outputs.cintaSalidaB ? 'Banda Salida B ON' : 'Bandas Salida OFF',
      );
      fijarAttr(ref('chip-q23'), 'data-on', outputs.cintaSalidaA || outputs.cintaSalidaB ? 'si' : 'no');
      fijarAttr(ref('chip-q7'), 'data-on', outputs.frenoAdmision ? 'si' : 'no');

      // 3. Animación en vivo de los 3 renglones de Escalera (Ladder)
      const sinEmergencia = !inputs.emergencia && codigo !== 'PARADA_EMERGENCIA' && codigo !== 'FALLA_ATASCO';
      const sinEstibaLlena = !inputs.estibaLlenaA && !inputs.estibaLlenaB && codigo !== 'ESPERANDO_CAMBIO_ESTIBA';
      const enCiclo = Boolean(outputs.cintaEntrada || inputs.marcha);

      // Rung 1: Tracción principal Q0
      fijarAttr(ref('c-marcha'), 'data-on', enCiclo ? 'si' : 'no');
      fijarAttr(ref('c-no-emerg'), 'data-on', sinEmergencia ? 'si' : 'no');
      fijarAttr(ref('c-no-llena'), 'data-on', sinEstibaLlena ? 'si' : 'no');
      fijarAttr(ref('b-q0'), 'data-on', outputs.cintaEntrada ? 'si' : 'no');
      fijarAttr(ref('rung-1'), 'data-conduce', outputs.cintaEntrada ? 'si' : 'no');

      // Rung 2: Desviador 45° y Salida B
      const destinoEsB = outputs.desviadorActivo || ir.ultimoSku === 2 || (hr.modoRuteo === 0 && inputs.selectorDestinoB);
      fijarAttr(ref('c-sensor'), 'data-on', sensorInActivo || outputs.desviadorActivo ? 'si' : 'no');
      fijarAttr(ref('c-rutab'), 'data-on', destinoEsB ? 'si' : 'no');
      fijarAttr(ref('b-q1'), 'data-on', outputs.desviadorActivo ? 'si' : 'no');
      fijarAttr(ref('rung-2'), 'data-conduce', outputs.desviadorActivo ? 'si' : 'no');

      // Rung 3: Freno de Cola Q7 y Watchdog TON
      const clasificando = codigo === 'CLASIFICANDO_RUTA_A' || codigo === 'CLASIFICANDO_RUTA_B';
      fijarAttr(ref('c-clasif'), 'data-on', clasificando || outputs.frenoAdmision ? 'si' : 'no');
      fijarAttr(ref('c-no-salida'), 'data-on', !salidaActiva ? 'si' : 'no');
      fijarAttr(ref('b-q7'), 'data-on', outputs.frenoAdmision ? 'si' : 'no');
      fijarAttr(ref('rung-3'), 'data-conduce', outputs.frenoAdmision ? 'si' : 'no');
    },
  };
}

