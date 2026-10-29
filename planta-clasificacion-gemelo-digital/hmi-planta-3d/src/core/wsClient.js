// Cliente WebSocket hacia el middleware (capa C2) con conmutación inteligente
// a FSM Local IEC 61131-3 para demostraciones web autónomas (Portafolio).
import { FsmLocalPLC } from './fsmLocal.js';

const RECONEXION_BASE_MS = 500;
const RECONEXION_MAXIMA_MS = 5000;
const TIEMPO_ESPERA_FALLBACK_MS = 1500;

// ws://<equipo que sirve la HMI>:8080, o el indicado con ?ws=ws://host:puerto
export function urlMiddleware(ubicacion = window.location) {
  const indicada = new URLSearchParams(ubicacion.search).get('ws');
  if (indicada) return indicada;
  const host = !ubicacion.hostname || ubicacion.hostname === 'localhost' ? '127.0.0.1' : ubicacion.hostname;
  return `ws://${host}:8080`;
}

// Eventos: 'estado' (detail = mensaje del contrato), 'ack', 'conexion' (detail = { conectado, modo })
export class ClienteMiddleware extends EventTarget {
  conectado = false;
  ultimoEstado = null;
  modoAutonomo = false;
  #url;
  #socket = null;
  #intentos = 0;
  #fsmLocal = null;
  #fallbackTimer = null;

  constructor(url) {
    super();
    this.#url = url;

    // En despliegue HTTPS (GitHub Pages / Vercel) o con parámetro demo,
    // activar inmediatamente el motor FSM local para evitar errores de Mixed Content
    const forzarAutonomo =
      typeof window !== 'undefined' &&
      (window.location.protocol === 'https:' ||
        new URLSearchParams(window.location.search).get('modo') === 'autonomo' ||
        new URLSearchParams(window.location.search).get('demo') === '1');

    if (forzarAutonomo) {
      this.#activarFsmLocal('Demostración Web Autónoma');
    } else {
      this.#conectar();
      // Si el middleware local no responde en 1.5 s, activar FSM local
      this.#fallbackTimer = setTimeout(() => {
        if (!this.conectado && !this.modoAutonomo) {
          this.#activarFsmLocal('Middleware local no detectado · Modo Portafolio');
        }
      }, TIEMPO_ESPERA_FALLBACK_MS);
    }
  }

  enviar(comando) {
    if (this.modoAutonomo && this.#fsmLocal) {
      return this.#fsmLocal.enviar(comando);
    }
    if (!this.conectado || !this.#socket) return false;
    this.#socket.send(JSON.stringify({ type: 'command', ...comando }));
    return true;
  }

  #emitir(tipo, detail) {
    this.dispatchEvent(new CustomEvent(tipo, { detail }));
  }

  #activarFsmLocal(razon) {
    if (this.modoAutonomo) return;
    this.modoAutonomo = true;
    this.conectado = true;
    this.#fsmLocal = new FsmLocalPLC();
    this.#fsmLocal.addEventListener('estado', (e) => {
      this.ultimoEstado = e.detail;
      this.#emitir('estado', e.detail);
    });
    this.#fsmLocal.addEventListener('ack', (e) => this.#emitir('ack', e.detail));
    this.#fsmLocal.addEventListener('conexion', (e) => {
      this.#emitir('conexion', { conectado: true, modo: 'autonomo', razon });
    });
  }

  #conectar() {
    if (this.modoAutonomo) return;
    try {
      const socket = new WebSocket(this.#url);
      this.#socket = socket;
      socket.addEventListener('open', () => {
        if (this.#fallbackTimer) clearTimeout(this.#fallbackTimer);
        if (this.#fsmLocal) {
          this.#fsmLocal.destruir();
          this.#fsmLocal = null;
        }
        this.modoAutonomo = false;
        this.#intentos = 0;
        this.conectado = true;
        this.#emitir('conexion', { conectado: true, modo: 'ot' });
      });
      socket.addEventListener('message', ({ data }) => {
        let mensaje;
        try {
          mensaje = JSON.parse(data);
        } catch {
          return;
        }
        if (mensaje.type === 'ack') {
          this.#emitir('ack', mensaje);
        } else {
          this.ultimoEstado = mensaje;
          this.#emitir('estado', mensaje);
        }
      });
      socket.addEventListener('close', () => {
        const estabaConectado = this.conectado;
        this.conectado = false;
        this.ultimoEstado = null;
        if (estabaConectado) this.#emitir('conexion', { conectado: false });
        if (!this.modoAutonomo) {
          this.#activarFsmLocal('Enlace Modbus en espera · Modo Portafolio');
        }
        const espera = Math.min(RECONEXION_BASE_MS * 2 ** this.#intentos, RECONEXION_MAXIMA_MS);
        this.#intentos += 1;
        setTimeout(() => this.#conectar(), espera);
      });
    } catch {
      this.#activarFsmLocal('Error al iniciar WebSocket');
    }
  }
}
