// Servidor WebSocket (RFC 6455) hacia la HMI: difunde el estado a todos los
// clientes y entrega cada mensaje entrante como evento 'comando'.
import { EventEmitter } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';

const TAMANO_MAXIMO_MENSAJE = 4096;   // un comando válido ocupa < 100 bytes

export class ServidorWebSocket extends EventEmitter {
  #opciones;
  #log;
  #servidor = null;
  #ultimoEstado = null;   // D2 · último estado JSON en memoria (docs/01 §5.2)

  constructor({ host, port }, log) {
    super();
    this.#opciones = { host, port };
    this.#log = log;
  }

  get clientes() {
    return this.#servidor?.clients.size ?? 0;
  }

  iniciar() {
    return new Promise((resolve, reject) => {
      const { host, port } = this.#opciones;
      this.#servidor = new WebSocketServer({ host, port, maxPayload: TAMANO_MAXIMO_MENSAJE });
      this.#servidor.once('listening', resolve);
      this.#servidor.once('error', reject);
      this.#servidor.on('connection', (socket, peticion) => this.#atender(socket, peticion));
    });
  }

  // Serializa una sola vez y envía a todos los clientes abiertos
  difundir(estado) {
    this.#ultimoEstado = JSON.stringify(estado);
    for (const socket of this.#servidor?.clients ?? []) {
      if (socket.readyState === WebSocket.OPEN) socket.send(this.#ultimoEstado);
    }
  }

  detener() {
    if (!this.#servidor) return Promise.resolve();
    for (const socket of this.#servidor.clients) socket.terminate();
    return new Promise((resolve) => this.#servidor.close(() => resolve()));
  }

  #atender(socket, peticion) {
    const cliente = `${peticion.socket.remoteAddress}:${peticion.socket.remotePort}`;
    this.#log.info({ cliente, clientes: this.clientes }, 'HMI conectada');

    // El cliente nuevo recibe el último estado sin esperar al siguiente ciclo
    if (this.#ultimoEstado) socket.send(this.#ultimoEstado);

    const responder = (ack) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(ack));
    };
    socket.on('message', (datos) => this.emit('comando', { texto: datos.toString(), responder, cliente }));
    socket.on('close', () => this.#log.info({ cliente, clientes: this.clientes }, 'HMI desconectada'));
    socket.on('error', (error) => this.#log.warn({ cliente, error: error.message }, 'error en el WebSocket'));
  }
}
