import { Heightfield, type HeightfieldSpec } from '../heightfield.js';
import type { ParticleSpec, RayHit, WorldOptions } from '../world.js';
import { listen, send, type PortLike } from './ports.js';
import type { MainToWorker, WorkerToMain } from './protocol.js';

export interface WorkerWorldOptions extends Omit<WorldOptions, 'heightfield'> {
  /**
   * Heightfield terrain: a plain HeightfieldSpec (crosses the worker
   * boundary as JSON) or a Heightfield instance to copy from. The worker
   * owns the terrain it builds; later edits to your instance do not
   * propagate.
   */
  heightfield?: HeightfieldSpec | Heightfield | null;
  /**
   * Injected worker/port. Default: a browser Worker bundled from
   * `./worker.web` (Vite/webpack URL pattern). In Node, pass a
   * `node:worker_threads` Worker pointed at `threaded/worker.node.js`
   * (see README) — or any MessageChannel port for tests.
   */
  worker?: PortLike;
  /** Test hook: force the structured-clone fallback even when SAB exists. */
  forceCopyMode?: boolean;
}

const DEFAULT_DT = 1 / 60;

declare const Worker:
  | (new (url: URL, options?: { type?: string }) => PortLike)
  | undefined;

/** Dev serves .ts straight from src; built dist has .js. Pick by our own URL. */
function defaultWorker(): PortLike {
  if (typeof Worker === 'undefined') {
    throw new Error(
      'WorkerWorld: no default worker outside the browser. ' +
        "Pass { worker: new Worker(...) } from node:worker_threads pointed at the package's threaded/worker.node.js.",
    );
  }
  const ownUrl = import.meta.url;
  const entry = ownUrl.endsWith('.ts') ? './worker.web.ts' : './worker.web.js';
  return new Worker(new URL(entry, ownUrl), { type: 'module' });
}

interface Pending<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * WorkerWorld — a World living on a background thread. This is the
 * recommended way to run Flit from a game/render loop: the physics step
 * never blocks the thread that draws.
 *
 *   const world = await WorkerWorld.create({ restitution: 0.6 });
 *   world.addParticles(specs);
 *   loop {
 *     if (world.kick(1/60)) { /* step started *\/ }
 *     render(world.positions);            // latest COMPLETED step, zero-copy
 *     await world.waitForUpdate();        // ...or await the one in flight
 *   }
 *
 * kick() coalesces: while a step is in flight it returns false and starts
 * nothing, so a slow sim degrades to dropped physics time, not a growing
 * message queue. In shared mode `positions` is a live ping-pong view into
 * SharedArrayBuffers — always the newest fully-written step, never torn.
 *
 * Capacity is FIXED at creation (the shared buffers are sized once);
 * radii are mirrored main-side from your own specs for rendering.
 */
export class WorkerWorld {
  public readonly capacity: number;
  private readonly port: PortLike;
  private readonly ownPort: boolean;
  private readonly sharedBuffers: [Float32Array, Float32Array] | null;
  private copyPositions: Float32Array = new Float32Array(0);
  private readBuf = 0;
  private countMirror = 0;
  private settledMirror = 0;
  private readonly radiiMirror: Float32Array;
  private stepSeen = 0;
  private inFlight = false;
  private kickedAt = 0;
  private roundtripMs = 0;
  private failure: Error | null = null;
  private readonly waiters: Pending<number>[] = [];
  private raySeq = 0;
  private readonly rayPending = new Map<number, Pending<RayHit[]>>();
  private readonly readyPending: Pending<boolean>;
  private readonly readyPromise: Promise<boolean>;

  private constructor(port: PortLike, ownPort: boolean, capacity: number, shared: boolean) {
    this.port = port;
    this.ownPort = ownPort;
    this.capacity = capacity;
    this.radiiMirror = new Float32Array(capacity);
    if (shared) {
      this.sharedBuffers = [
        new Float32Array(new SharedArrayBuffer(capacity * 3 * 4)),
        new Float32Array(new SharedArrayBuffer(capacity * 3 * 4)),
      ];
    } else {
      this.sharedBuffers = null;
    }

    let readyResolve!: (shared: boolean) => void;
    let readyReject!: (error: Error) => void;
    this.readyPromise = new Promise<boolean>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    // Avoid an unhandled rejection if create() is interrupted by dispose().
    this.readyPromise.catch(() => {});
    this.readyPending = { resolve: readyResolve, reject: readyReject };

    listen(this.port, (raw) => {
      const message = raw as WorkerToMain;
      switch (message.type) {
        case 'ready':
          this.readyPending.resolve(message.shared);
          break;
        case 'stepped':
          this.readBuf = message.buf;
          if (message.positions) this.copyPositions = message.positions;
          this.settledMirror = message.settledCount;
          this.completeStep(message.step);
          break;
        case 'raycast-result': {
          const pending = this.rayPending.get(message.id);
          if (pending) {
            this.rayPending.delete(message.id);
            pending.resolve(message.hits);
          }
          break;
        }
        case 'error':
          this.fail(new Error(message.message));
          break;
      }
    });
  }

  /**
   * Create and handshake with the worker. Resolves once the sim is ready.
   * `capacity` (default 1024) is fixed for the world's lifetime.
   */
  public static async create(options: WorkerWorldOptions = {}): Promise<WorkerWorld> {
    const { worker, forceCopyMode, heightfield, ...worldOptions } = options;
    const ownPort = worker === undefined;
    const port = worker ?? defaultWorker();
    const capacity = worldOptions.capacity ?? 1024;
    const canShare = !forceCopyMode && typeof SharedArrayBuffer !== 'undefined';

    // Terrain crosses the wire as a plain spec (structured clone would
    // strip an instance's methods); the worker rebuilds the Heightfield.
    const heightfieldSpec: HeightfieldSpec | null | undefined =
      heightfield instanceof Heightfield
        ? {
            rows: heightfield.rows,
            cols: heightfield.cols,
            cellSize: heightfield.cellSize,
            heights: heightfield.heights,
            origin: heightfield.origin,
          }
        : heightfield;

    const world = new WorkerWorld(port, ownPort, capacity, canShare);
    try {
      const init: MainToWorker = {
        type: 'init',
        options: { ...worldOptions, heightfield: heightfieldSpec },
        capacity,
        shared: world.sharedBuffers ? { positions: world.sharedBuffers } : null,
      };
      send(port, init);
      await world.readyPromise;
      return world;
    } catch (error) {
      world.dispose();
      throw error;
    }
  }

  /** True when rendering reads SharedArrayBuffers directly (zero-copy). */
  public get shared(): boolean {
    return this.sharedBuffers !== null;
  }

  /** Positions of the latest COMPLETED step (count*3 floats). Never torn. */
  public get positions(): Float32Array {
    return this.sharedBuffers ? this.sharedBuffers[this.readBuf] : this.copyPositions;
  }

  public get count(): number {
    return this.countMirror;
  }

  /** Bodies asleep after the latest COMPLETED step (see World.settledCount). */
  public get settledCount(): number {
    return this.settledMirror;
  }

  /** Wall-clock ms of the last kick()→completion roundtrip, Date.now-based. */
  public get lastRoundtripMs(): number {
    return this.roundtripMs;
  }

  /** Radius as passed to addParticles (mirrored main-side for rendering). */
  public radiusOf(index: number): number {
    return this.radiiMirror[index];
  }

  /**
   * Add particles; returns the first new index. Indices are stable and
   * deterministic (the worker applies messages in order, it is the only
   * writer). Throws immediately if capacity would be exceeded.
   */
  public addParticles(specs: ParticleSpec[]): number {
    this.assertHealthy();
    if (this.countMirror + specs.length > this.capacity) {
      throw new Error(
        `WorkerWorld capacity exceeded: ${this.countMirror + specs.length} > ${this.capacity}. ` +
          'Threaded worlds do not grow; recreate with a larger capacity.',
      );
    }
    const first = this.countMirror;
    specs.forEach((spec, i) => {
      this.radiiMirror[first + i] = spec.radius ?? 0.5;
    });
    this.countMirror += specs.length;
    const message: MainToWorker = { type: 'add', particles: specs };
    send(this.port, message);
    return first;
  }

  /**
   * Start one physics step on the worker; returns immediately.
   * Returns false (starting nothing) if a step is already in flight.
   */
  public kick(dt = DEFAULT_DT): boolean {
    this.assertHealthy();
    if (this.inFlight) return false;
    this.inFlight = true;
    this.kickedAt = Date.now();
    const message: MainToWorker = { type: 'step', dt };
    send(this.port, message);
    return true;
  }

  /** Resolve with the step counter once the in-flight (or next) step lands. */
  public waitForUpdate(): Promise<number> {
    this.assertHealthy();
    if (!this.inFlight) return Promise.resolve(this.stepSeen);
    return new Promise<number>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /** kick() + waitForUpdate() in one call, for lockstep loops. */
  public async stepOnce(dt = DEFAULT_DT): Promise<number> {
    this.kick(dt);
    return this.waitForUpdate();
  }

  /** Raycast against the worker's latest state (queued FIFO after steps). */
  public raycast(
    origin: [number, number, number],
    direction: [number, number, number],
    maxDistance = Infinity,
  ): Promise<RayHit[]> {
    this.assertHealthy();
    const id = this.raySeq;
    this.raySeq += 1;
    const message: MainToWorker = { type: 'raycast', id, origin, direction, maxDistance };
    send(this.port, message);
    return new Promise<RayHit[]>((resolve, reject) => {
      this.rayPending.set(id, { resolve, reject });
    });
  }

  /** Stop the worker and release the port. Pending promises reject. */
  public dispose(): void {
    const message: MainToWorker = { type: 'dispose' };
    try {
      send(this.port, message);
    } catch {
      // Port already gone; dispose is best-effort.
    }
    if (this.ownPort) {
      this.port.terminate?.();
      this.port.close?.();
    }
    this.fail(new Error('WorkerWorld disposed'));
  }

  private completeStep(step: number): void {
    if (!this.inFlight) return; // Stray/stale completion; nothing to wake.
    this.inFlight = false;
    this.stepSeen = step;
    this.roundtripMs = Date.now() - this.kickedAt;
    const pending = this.waiters.splice(0);
    for (const waiter of pending) waiter.resolve(step);
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    this.inFlight = false;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
    for (const pending of this.rayPending.values()) pending.reject(error);
    this.rayPending.clear();
  }

  private assertHealthy(): void {
    if (this.failure) throw this.failure;
  }
}
