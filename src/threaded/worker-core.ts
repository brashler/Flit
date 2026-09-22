import { Heightfield } from '../heightfield.js';
import { World } from '../world.js';
import { listen, send, type PortLike } from './ports.js';
import type { MainToWorker, WorkerToMain } from './protocol.js';

/**
 * The worker half of WorkerWorld: owns the (single-writer) World and answers
 * protocol messages. Environment-agnostic — the web and node entry files are
 * one-liners that call install() with their port. Tests install() it on a
 * same-thread MessageChannel port.
 *
 * Only 'step' costs real time; everything else is bookkeeping. Errors are
 * reported over the wire (never thrown across the boundary).
 */
export function install(port: PortLike, closeSelf: () => void): void {
  let world: World | null = null;
  let capacity = 0;
  let shared: { positions: [Float32Array, Float32Array] } | null = null;
  let step = 0;
  /** Ping-pong index the renderer may read; the worker writes the other. */
  let readBuf = 0;

  const reply = (message: WorkerToMain, transfer?: ArrayBuffer[]): void =>
    send(port, message, transfer);

  listen(port, (raw) => {
    const message = raw as MainToWorker;
    try {
      switch (message.type) {
        case 'init': {
          capacity = message.capacity;
          const { heightfield, ...rest } = message.options;
          world = new World({
            ...rest,
            capacity,
            // Terrain crosses as a plain spec (see protocol.ts).
            heightfield: heightfield ? new Heightfield(heightfield) : null,
          });
          shared = message.shared;
          reply({ type: 'ready', shared: shared !== null });
          break;
        }
        case 'add': {
          if (!world) throw new Error('add before init');
          if (world.count + message.particles.length > capacity) {
            throw new Error(
              `WorkerWorld capacity exceeded: ${world.count + message.particles.length} > ${capacity}. ` +
                'Threaded worlds do not grow; recreate with a larger capacity.',
            );
          }
          for (const spec of message.particles) world.addParticle(spec);
          break;
        }
        case 'step': {
          if (!world) throw new Error('step before init');
          world.step(message.dt);
          step += 1;
          if (shared) {
            const back = 1 - readBuf;
            shared.positions[back].set(world.positions.subarray(0, world.count * 3));
            readBuf = back;
            reply({ type: 'stepped', step, buf: back, settledCount: world.settledCount });
          } else {
            const copy = world.positions.slice(0, world.count * 3);
            reply({ type: 'stepped', step, buf: 0, positions: copy, settledCount: world.settledCount }, [
              copy.buffer,
            ]);
          }
          break;
        }
        case 'raycast': {
          if (!world) throw new Error('raycast before init');
          const hits = world.raycast(message.origin, message.direction, message.maxDistance);
          reply({ type: 'raycast-result', id: message.id, hits });
          break;
        }
        case 'dispose': {
          closeSelf();
          break;
        }
      }
    } catch (error) {
      reply({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });
}
