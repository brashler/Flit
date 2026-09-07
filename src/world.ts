import { vec3 } from 'gl-matrix';
import { SpatialHash } from './spatial-hash.js';

export interface ParticleSpec {
  position: [number, number, number];
  velocity?: [number, number, number];
  /** Default 0.5. */
  radius?: number;
  /** Default 1. Pass 0 for a static (infinite-mass) body. */
  mass?: number;
}

export interface WorldOptions {
  /** Default [0, -9.81, 0]. */
  gravity?: [number, number, number];
  /** Coefficient of restitution, 0 = clay, 1 = superball. Default 0.4. */
  restitution?: number;
  /** Y coordinate of the infinite ground plane. Default 0; null disables it. */
  groundY?: number | null;
  /** Initial particle capacity. Grows automatically. Default 1024. */
  capacity?: number;
}

// Scratch vectors for the hot loop — allocated once, never per frame.
const _normal = vec3.create();
const _relVel = vec3.create();

/**
 * World — a handful of spheres and gravity, nothing more.
 *
 * All state lives in flat Float32Arrays (structure-of-arrays): the same
 * layout a WebGPU compute backend would want, so the CPU path doubles as
 * the reference implementation for a future GPU one.
 *
 * step() order: integrate (semi-implicit Euler) -> broadphase (SpatialHash)
 * -> narrowphase impulse + positional correction -> ground plane.
 */
export class World {
  /** Live simulation buffers — read them directly (e.g. to sync 3js meshes). */
  public positions: Float32Array;
  public velocities: Float32Array;

  private invMasses: Float32Array;
  private radii: Float32Array;
  private posViews: vec3[] = [];
  private velViews: vec3[] = [];
  private capacity: number;

  public count = 0;

  public readonly gravity: vec3;
  public restitution: number;
  public groundY: number | null;

  private readonly hash = new SpatialHash(1);

  constructor(options: WorldOptions = {}) {
    this.capacity = options.capacity ?? 1024;
    this.positions = new Float32Array(this.capacity * 3);
    this.velocities = new Float32Array(this.capacity * 3);
    this.invMasses = new Float32Array(this.capacity);
    this.radii = new Float32Array(this.capacity);

    this.gravity = vec3.fromValues(...(options.gravity ?? [0, -9.81, 0]));
    this.restitution = options.restitution ?? 0.4;
    this.groundY = options.groundY === undefined ? 0 : options.groundY;
  }

  /** Add a particle, returns its index. Indices are stable for the World's lifetime. */
  public addParticle(spec: ParticleSpec): number {
    this.ensureCapacity(this.count + 1);
    const i = this.count;
    this.count += 1;

    this.posViews[i] = (this.positions.subarray(i * 3, i * 3 + 3) as vec3);
    this.velViews[i] = (this.velocities.subarray(i * 3, i * 3 + 3) as vec3);

    vec3.set(this.posViews[i], ...spec.position);
    vec3.set(this.velViews[i], ...(spec.velocity ?? [0, 0, 0]));
    this.radii[i] = spec.radius ?? 0.5;
    const mass = spec.mass ?? 1;
    this.invMasses[i] = mass > 0 ? 1 / mass : 0;

    return i;
  }

  public radiusOf(index: number): number {
    return this.radii[index];
  }

  public step(dt: number): void {
    this.integrate(dt);
    this.solveContacts();
  }

  private integrate(dt: number): void {
    for (let i = 0; i < this.count; i += 1) {
      if (this.invMasses[i] === 0) continue; // static bodies don't integrate
      vec3.scaleAndAdd(this.velViews[i], this.velViews[i], this.gravity, dt);
      vec3.scaleAndAdd(this.posViews[i], this.posViews[i], this.velViews[i], dt);
    }
  }

  private solveContacts(): void {
    this.rebuildHash();
    this.hash.queryPairs((i, j) => this.resolvePair(i, j));
    if (this.groundY !== null) {
      this.resolveGround(this.groundY);
    }
  }

  private rebuildHash(): void {
    // Cell size ~2x the largest radius: the textbook ratio that keeps
    // per-cell occupancy ~1 for uniform spheres.
    let maxRadius = 0.0001;
    for (let i = 0; i < this.count; i += 1) {
      if (this.radii[i] > maxRadius) maxRadius = this.radii[i];
    }
    this.hash.cellSize = maxRadius * 2;

    this.hash.clear();
    for (let i = 0; i < this.count; i += 1) {
      const p = this.posViews[i];
      this.hash.insert(i, p[0], p[1], p[2]);
    }
  }

  private resolvePair(i: number, j: number): void {
    const pi = this.posViews[i];
    const pj = this.posViews[j];
    const invMi = this.invMasses[i];
    const invMj = this.invMasses[j];
    const totalInvMass = invMi + invMj;
    if (totalInvMass === 0) return; // two static bodies: nothing to do

    const radiusSum = this.radii[i] + this.radii[j];
    vec3.subtract(_normal, pj, pi);
    const dist = vec3.length(_normal);
    if (dist >= radiusSum || dist < 1e-12) return; // no contact (or pathologically concentric)

    vec3.scale(_normal, _normal, 1 / dist);

    // Positional correction: push apart along the normal, weighted by mass.
    const correction = (radiusSum - dist) / totalInvMass;
    vec3.scaleAndAdd(pi, pi, _normal, -correction * invMi);
    vec3.scaleAndAdd(pj, pj, _normal, correction * invMj);

    // Impulse: only if the bodies are actually approaching.
    vec3.subtract(_relVel, this.velViews[j], this.velViews[i]);
    const normalSpeed = vec3.dot(_relVel, _normal);
    if (normalSpeed >= 0) return;

    const impulse = (-(1 + this.restitution) * normalSpeed) / totalInvMass;
    vec3.scaleAndAdd(this.velViews[i], this.velViews[i], _normal, -impulse * invMi);
    vec3.scaleAndAdd(this.velViews[j], this.velViews[j], _normal, impulse * invMj);
  }

  private resolveGround(groundY: number): void {
    for (let i = 0; i < this.count; i += 1) {
      if (this.invMasses[i] === 0) continue;
      const p = this.posViews[i];
      const penetration = groundY + this.radii[i] - p[1];
      if (penetration <= 0) continue;

      p[1] += penetration;
      const v = this.velViews[i];
      if (v[1] < 0) v[1] = -v[1] * this.restitution;
    }
  }

  private ensureCapacity(needed: number): void {
    if (needed <= this.capacity) return;
    this.capacity = Math.max(needed, this.capacity * 2);

    const grow = (arr: Float32Array) => {
      const next = new Float32Array(arr.length * 2);
      next.set(arr);
      return next;
    };
    this.positions = grow(this.positions);
    this.velocities = grow(this.velocities);
    this.invMasses = grow(this.invMasses);
    this.radii = grow(this.radii);

    // Views pointed at the old buffers — rebuild them all.
    for (let i = 0; i < this.count; i += 1) {
      this.posViews[i] = (this.positions.subarray(i * 3, i * 3 + 3) as vec3);
      this.velViews[i] = (this.velocities.subarray(i * 3, i * 3 + 3) as vec3);
    }
  }
}
