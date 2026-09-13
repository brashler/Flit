/**
 * Minimal structural port abstraction so the threaded sim runs unchanged on
 * web Workers, node:worker_threads, and same-thread MessageChannel ports
 * (used by the tests). We deliberately avoid DOM lib types — the library
 * build targets ES2022 only.
 */
export interface PortLike {
  postMessage(message: unknown, transfer?: never): void;
  /** Web workers and MessagePorts (browser AND node). */
  onmessage?: unknown;
  /** node:worker_threads style (Worker, and MessagePort there too). */
  on?(event: 'message', cb: (data: unknown) => void): unknown;
  /** Present on Workers (web + node); called by WorkerWorld.dispose(). */
  terminate?: () => unknown;
  /** Present on MessagePorts; called by WorkerWorld.dispose(). */
  close?: () => void;
}

/** Send a message. `transfer` lists ArrayBuffers to move, not copy. */
export function send(port: PortLike, message: unknown, transfer?: ArrayBuffer[]): void {
  // All supported port implementations share this exact call shape.
  port.postMessage(message, transfer as never);
}

/** Subscribe to messages, hiding the on-vs-onmessage fork. */
export function listen(port: PortLike, cb: (message: unknown) => void): void {
  if (typeof port.on === 'function') {
    port.on('message', cb);
  } else {
    port.onmessage = (event: { data: unknown }) => cb(event.data);
  }
}
