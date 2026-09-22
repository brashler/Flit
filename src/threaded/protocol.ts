import type { HeightfieldSpec } from '../heightfield.js';
import type { ParticleSpec, RayHit, WorldOptions } from '../world.js';

/**
 * WorldOptions as they cross the wire: a Heightfield class instance would
 * arrive methodless after structured clone, so terrain travels as its
 * plain spec and the worker constructs the Heightfield on its side.
 */
export type WireWorldOptions = Omit<WorldOptions, 'heightfield'> & {
  heightfield?: HeightfieldSpec | null;
};

/**
 * Wire protocol between WorkerWorld (main thread) and the sim worker.
 *
 * Two modes, negotiated at init:
 * - shared: the main thread allocates two SharedArrayBuffer-backed position
 *   buffers. After each step the worker copies its positions into the buffer
 *   the renderer is NOT reading, then replies 'stepped' with that buffer's
 *   index. Rendering is zero-copy and tear-free (classic ping-pong).
 * - copy: no SharedArrayBuffer (page not cross-origin isolated). The worker
 *   transfers a fresh positions copy with every 'stepped' reply.
 *
 * In both modes completion is signalled by the 'stepped' message — one
 * mechanism, no Atomics.waitAsync compatibility surface.
 */
export type MainToWorker =
  | {
      type: 'init';
      options: WireWorldOptions;
      /** Fixed particle capacity. Threaded worlds never grow (the ping-pong
       *  buffers are sized at init), so pick this up front. */
      capacity: number;
      /** Null in copy mode. */
      shared: { positions: [Float32Array, Float32Array] } | null;
    }
  | { type: 'add'; particles: ParticleSpec[] }
  | { type: 'step'; dt: number }
  | {
      type: 'raycast';
      id: number;
      origin: [number, number, number];
      direction: [number, number, number];
      maxDistance: number;
    }
  | { type: 'dispose' };

export type WorkerToMain =
  | { type: 'ready'; shared: boolean }
  /** `buf` is the ping-pong index the renderer may now read (shared mode). */
  | { type: 'stepped'; step: number; buf: number; positions?: Float32Array }
  | { type: 'raycast-result'; id: number; hits: RayHit[] }
  | { type: 'error'; message: string };
