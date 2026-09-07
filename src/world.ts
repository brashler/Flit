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
  /**
   * Friction preset, 0..1, used to (re)generate `frictionLut` with kinetic
   * retention = 1 - mu in 1/256 fixed point. Default 0.3. Edit the LUT
   * directly for full control — it only regenerates when `friction` changes.
   */
  friction?: number;
  /** Sequential-impulse iterations per step. Default 4. */
  velocityIterations?: number;
  /** Y coordinate of the infinite ground plane. Default 0; null disables it. */
  groundY?: number | null;
  /**
   * Optional axis-aligned box; dynamic bodies reflect off its walls with
   * the world restitution. Independent of groundY. Default null (no walls).
   */
  bounds?: { min: [number, number, number]; max: [number, number, number] } | null;
  /** Initial particle capacity. Grows automatically. Default 1024. */
  capacity?: number;
}

export interface RayHit {
  /** Body index. */
  index: number;
  /** Distance along the (normalized) ray direction. */
  distance: number;
  point: [number, number, number];
  normal: [number, number, number];
}

// Scratch vectors for the hot loop — allocated once, never per frame.
const _normal = vec3.create();
const _relVel = vec3.create();
const _tangent = vec3.create();

/** Impacts slower than this lose restitution, so resting contacts stop jittering. */
const RESTITUTION_THRESHOLD = 1;
/** Positional correction leaves this much penetration (m) to avoid fighting gravity. */
const SLOP = 0.002;
/** Fraction of penetration corrected per step (remaining resolves over a few steps). */
const CORRECTION_PERCENT = 0.8;

/**
 * World — a handful of spheres and gravity, nothing more.
 *
 * All state lives in flat Float32Arrays (structure-of-arrays): the same
 * layout a WebGPU compute backend would want, so the CPU path doubles as
 * the reference implementation for a future GPU one.
 *
 * step() order: integrate (semi-implicit Euler) -> broadphase (SpatialHash)
 * -> narrowphase contact list -> sequential-impulse velocity solve
 * (restitution bias + fixed-point LUT friction) -> split positional
 * correction -> planes (ground/bounds).
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
  public friction: number;
  public velocityIterations: number;
  public groundY: number | null;
  public bounds: { min: vec3; max: vec3 } | null;

  /**
   * Tangential-velocity retention in 1/256 fixed point, indexed by a
   * quantized squared tangential speed. Bucket 0 (slow contacts) snaps to
   * a stop; buckets 1..15 are kinetic retention. Generated from the
   * `friction` preset; hand-tunable for custom response curves.
   */
  public readonly frictionLut = new Uint16Array(16);
  private frictionLutBuiltFor = -1;

  private readonly hash = new SpatialHash(1);
  private hashDirty = true;

  // Contact list (flat arrays, reused per step; no warm starting yet).
  private contactI = new Int32Array(256);
  private contactJ = new Int32Array(256);
  private contactN = new Float32Array(256 * 3);
  private contactBias = new Float32Array(256);
  private contactAccN = new Float32Array(256);
  private contactPen = new Float32Array(256);
  private contactCount = 0;

  // Raycast dedupe stamps (per-ray id instead of a Set).
  private rayStamp = new Int32Array(1024);
  private rayId = 0;

  constructor(options: WorldOptions = {}) {
    this.capacity = options.capacity ?? 1024;
    this.positions = new Float32Array(this.capacity * 3);
    this.velocities = new Float32Array(this.capacity * 3);
    this.invMasses = new Float32Array(this.capacity);
    this.radii = new Float32Array(this.capacity);

    this.gravity = vec3.fromValues(...(options.gravity ?? [0, -9.81, 0]));
    this.restitution = options.restitution ?? 0.4;
    this.friction = options.friction ?? 0.3;
    this.velocityIterations = options.velocityIterations ?? 4;
    this.groundY = options.groundY === undefined ? 0 : options.groundY;
    this.bounds = options.bounds
      ? { min: vec3.fromValues(...options.bounds.min), max: vec3.fromValues(...options.bounds.max) }
      : null;
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

    this.hashDirty = true;
    return i;
  }

  public radiusOf(index: number): number {
    return this.radii[index];
  }

  public step(dt: number): void {
    this.refreshFrictionLut();
    this.integrate(dt);
    this.rebuildHash();
    this.buildContacts();
    this.solveVelocities();
    this.solvePositions();
    if (this.groundY !== null) {
      this.resolveGround(this.groundY);
    }
    if (this.bounds !== null) {
      this.resolveBounds(this.bounds);
    }
  }

  /**
   * Cast a ray through the broadphase grid (Amanatides-Woo voxel walk,
   * treating the Morton cells as the voxel discretization). Returns hits
   * sorted by distance. Uses the broadphase state from the last step()
   * (rebuilt automatically if particles were added since); if you moved
   * bodies by writing into `positions` directly, call syncBroadphase()
   * first.
   */
  public raycast(
    origin: [number, number, number],
    direction: [number, number, number],
    maxDistance = Infinity,
  ): RayHit[] {
    if (this.hashDirty) this.rebuildHash();
    const dirLen = Math.hypot(direction[0], direction[1], direction[2]);
    if (dirLen < 1e-12 || this.count === 0) return [];
    const dx = direction[0] / dirLen;
    const dy = direction[1] / dirLen;
    const dz = direction[2] / dirLen;
    const s = this.hash.cellSize;

    // Voxel = biased grid cell. Amanatides-Woo: step/tMax/tDelta per axis.
    let cx = Math.floor(origin[0] / s);
    let cy = Math.floor(origin[1] / s);
    let cz = Math.floor(origin[2] / s);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(s / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(s / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(s / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((cx + (stepX > 0 ? 1 : 0)) * s - origin[0]) / dx : Infinity;
    let tMaxY = dy !== 0 ? ((cy + (stepY > 0 ? 1 : 0)) * s - origin[1]) / dy : Infinity;
    let tMaxZ = dz !== 0 ? ((cz + (stepZ > 0 ? 1 : 0)) * s - origin[2]) / dz : Infinity;

    const hits: RayHit[] = [];
    this.rayId += 1;
    const stamp = this.rayStamp;
    let t = 0;

    // Walk voxels in ray order until we pass maxDistance (or run away).
    for (let guard = 0; guard < 4096 && t <= maxDistance; guard += 1) {
      const bucket = this.hash.getCellBodies(cx, cy, cz);
      if (bucket) {
        for (const i of bucket) {
          if (stamp[i] === this.rayId) continue; // spans multiple cells: test once
          stamp[i] = this.rayId;
          const hit = this.raySphere(i, origin, dx, dy, dz, maxDistance);
          if (hit) hits.push(hit);
        }
      }

      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
        t = tMaxX;
        tMaxX += tDeltaX;
        cx += stepX;
      } else if (tMaxY <= tMaxZ) {
        t = tMaxY;
        tMaxY += tDeltaY;
        cy += stepY;
      } else {
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        cz += stepZ;
      }
    }

    hits.sort((a, b) => a.distance - b.distance);
    return hits;
  }

  /** Rebuild the broadphase from current positions (raycast freshness). */
  public syncBroadphase(): void {
    this.rebuildHash();
  }

  private raySphere(
    i: number,
    origin: [number, number, number],
    dx: number,
    dy: number,
    dz: number,
    maxDistance: number,
  ): RayHit | null {
    const px = this.positions[i * 3];
    const py = this.positions[i * 3 + 1];
    const pz = this.positions[i * 3 + 2];
    const r = this.radii[i];

    const ocx = px - origin[0];
    const ocy = py - origin[1];
    const ocz = pz - origin[2];
    const tca = ocx * dx + ocy * dy + ocz * dz;
    const d2 = ocx * ocx + ocy * ocy + ocz * ocz - tca * tca;
    const r2 = r * r;
    if (d2 > r2) return null;

    const thc = Math.sqrt(r2 - d2);
    let t = tca - thc;
    if (t < 0) {
      t = tca + thc > 0 ? 0 : -1; // origin inside the sphere: hit at 0
      if (t < 0) return null;
    }
    if (t > maxDistance) return null;

    const hx = origin[0] + dx * t;
    const hy = origin[1] + dy * t;
    const hz = origin[2] + dz * t;
    let nx = (hx - px) / r;
    let ny = (hy - py) / r;
    let nz = (hz - pz) / r;
    const nLen = Math.hypot(nx, ny, nz);
    if (nLen < 1e-6) {
      nx = -dx;
      ny = -dy;
      nz = -dz; // degenerate (origin at center): face the ray
    }
    return { index: i, distance: t, point: [hx, hy, hz], normal: [nx, ny, nz] };
  }

  private integrate(dt: number): void {
    for (let i = 0; i < this.count; i += 1) {
      if (this.invMasses[i] === 0) continue; // static bodies don't integrate
      vec3.scaleAndAdd(this.velViews[i], this.velViews[i], this.gravity, dt);
      vec3.scaleAndAdd(this.posViews[i], this.posViews[i], this.velViews[i], dt);
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
    this.hashDirty = false;
  }

  private buildContacts(): void {
    this.contactCount = 0;
    this.hash.queryPairs((i, j) => this.addContact(i, j));
  }

  private addContact(i: number, j: number): void {
    const invMi = this.invMasses[i];
    const invMj = this.invMasses[j];
    if (invMi + invMj === 0) return; // two static bodies: nothing to do

    const pi = this.posViews[i];
    const pj = this.posViews[j];
    const radiusSum = this.radii[i] + this.radii[j];
    vec3.subtract(_normal, pj, pi);
    const dist = vec3.length(_normal);
    if (dist >= radiusSum || dist < 1e-12) return;

    this.ensureContactCapacity(this.contactCount + 1);
    const c = this.contactCount;
    this.contactCount += 1;

    vec3.scale(_normal, _normal, 1 / dist);
    this.contactI[c] = i;
    this.contactJ[c] = j;
    this.contactN[c * 3] = _normal[0];
    this.contactN[c * 3 + 1] = _normal[1];
    this.contactN[c * 3 + 2] = _normal[2];
    this.contactPen[c] = radiusSum - dist;
    this.contactAccN[c] = 0;

    // Restitution as a velocity bias, skipped for slow impacts (rest stability).
    vec3.subtract(_relVel, this.velViews[j], this.velViews[i]);
    const normalSpeed = vec3.dot(_relVel, _normal);
    this.contactBias[c] = normalSpeed < -RESTITUTION_THRESHOLD ? -this.restitution * normalSpeed : 0;
  }

  private solveVelocities(): void {
    for (let iter = 0; iter < this.velocityIterations; iter += 1) {
      for (let c = 0; c < this.contactCount; c += 1) {
        const i = this.contactI[c];
        const j = this.contactJ[c];
        const vi = this.velViews[i];
        const vj = this.velViews[j];
        const invMi = this.invMasses[i];
        const invMj = this.invMasses[j];
        const totalInv = invMi + invMj;

        _normal[0] = this.contactN[c * 3];
        _normal[1] = this.contactN[c * 3 + 1];
        _normal[2] = this.contactN[c * 3 + 2];

        // Normal impulse toward the bias velocity, accumulated and clamped >= 0.
        const relN =
          (vj[0] - vi[0]) * _normal[0] + (vj[1] - vi[1]) * _normal[1] + (vj[2] - vi[2]) * _normal[2];
        let lambda = (this.contactBias[c] - relN) / totalInv;
        const acc = this.contactAccN[c];
        const newAcc = Math.max(0, acc + lambda);
        lambda = newAcc - acc;
        this.contactAccN[c] = newAcc;
        vec3.scaleAndAdd(vi, vi, _normal, -lambda * invMi);
        vec3.scaleAndAdd(vj, vj, _normal, lambda * invMj);

        // Friction: damp the relative tangential velocity vector by a
        // fixed-point LUT factor. Viscous-style: no normalize, no sqrt.
        vec3.subtract(_relVel, vj, vi);
        const relN2 = vec3.dot(_relVel, _normal);
        vec3.scaleAndAdd(_tangent, _relVel, _normal, -relN2);
        const t2 = vec3.squaredLength(_tangent);
        const retain = this.frictionLut[World.frictionBucket(t2)] * (1 / 256);
        if (retain < 1) {
          const k = (1 - retain) / totalInv;
          vec3.scaleAndAdd(vi, vi, _tangent, k * invMi);
          vec3.scaleAndAdd(vj, vj, _tangent, -k * invMj);
        }
      }
    }
  }

  private solvePositions(): void {
    for (let c = 0; c < this.contactCount; c += 1) {
      const penetration = this.contactPen[c] - SLOP;
      if (penetration <= 0) continue;

      const i = this.contactI[c];
      const j = this.contactJ[c];
      const invMi = this.invMasses[i];
      const invMj = this.invMasses[j];
      const totalInv = invMi + invMj;
      if (totalInv === 0) continue;

      _normal[0] = this.contactN[c * 3];
      _normal[1] = this.contactN[c * 3 + 1];
      _normal[2] = this.contactN[c * 3 + 2];
      const correction = (penetration * CORRECTION_PERCENT) / totalInv;
      vec3.scaleAndAdd(this.posViews[i], this.posViews[i], _normal, -correction * invMi);
      vec3.scaleAndAdd(this.posViews[j], this.posViews[j], _normal, correction * invMj);
    }
  }

  private resolveGround(groundY: number): void {
    for (let i = 0; i < this.count; i += 1) {
      if (this.invMasses[i] === 0) continue;
      const p = this.posViews[i];
      const penetration = groundY + this.radii[i] - p[1];
      if (penetration <= 0) continue;

      p[1] += penetration;
      const v = this.velViews[i];
      if (v[1] < 0) {
        v[1] = -v[1] * this.restitution;
        this.dampTangential(v, 1);
      }
    }
  }

  private resolveBounds(bounds: { min: vec3; max: vec3 }): void {
    for (let i = 0; i < this.count; i += 1) {
      if (this.invMasses[i] === 0) continue;
      const p = this.posViews[i];
      const v = this.velViews[i];
      const r = this.radii[i];
      for (let axis = 0; axis < 3; axis += 1) {
        if (p[axis] - r < bounds.min[axis]) {
          p[axis] = bounds.min[axis] + r;
          if (v[axis] < 0) {
            v[axis] = -v[axis] * this.restitution;
            this.dampTangential(v, axis);
          }
        } else if (p[axis] + r > bounds.max[axis]) {
          p[axis] = bounds.max[axis] - r;
          if (v[axis] > 0) {
            v[axis] = -v[axis] * this.restitution;
            this.dampTangential(v, axis);
          }
        }
      }
    }
  }

  /** Plane friction: scale the two axes tangential to the contact by the LUT. */
  private dampTangential(v: vec3, normalAxis: number): void {
    const a = (normalAxis + 1) % 3;
    const b = (normalAxis + 2) % 3;
    const t2 = v[a] * v[a] + v[b] * v[b];
    const retain = this.frictionLut[World.frictionBucket(t2)] / 256;
    v[a] *= retain;
    v[b] *= retain;
  }

  /** Squared tangential speed -> LUT bucket (bucket 0 = |v| < 0.5, static zone). */
  private static frictionBucket(tangentialSpeedSq: number): number {
    return Math.min(15, Math.floor(tangentialSpeedSq * 4));
  }

  private refreshFrictionLut(): void {
    if (this.frictionLutBuiltFor === this.friction) return;
    this.frictionLutBuiltFor = this.friction;
    const mu = Math.min(1, Math.max(0, this.friction));
    this.frictionLut[0] = 0; // static zone: snap to a stop
    const kinetic = Math.round(256 * (1 - mu));
    for (let b = 1; b < 16; b += 1) this.frictionLut[b] = kinetic;
  }

  private ensureContactCapacity(needed: number): void {
    if (needed <= this.contactI.length) return;
    const capacity = Math.max(needed, this.contactI.length * 2);
    const growI = (arr: Int32Array) => {
      const next = new Int32Array(capacity);
      next.set(arr);
      return next;
    };
    const growF = (arr: Float32Array, stride = 1) => {
      const next = new Float32Array(capacity * stride);
      next.set(arr);
      return next;
    };
    this.contactI = growI(this.contactI);
    this.contactJ = growI(this.contactJ);
    this.contactN = growF(this.contactN, 3);
    this.contactBias = growF(this.contactBias);
    this.contactAccN = growF(this.contactAccN);
    this.contactPen = growF(this.contactPen);
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
    if (this.rayStamp.length < this.capacity) {
      const growStamps = new Int32Array(this.capacity);
      growStamps.set(this.rayStamp);
      this.rayStamp = growStamps;
    }

    // Views pointed at the old buffers — rebuild them all.
    for (let i = 0; i < this.count; i += 1) {
      this.posViews[i] = (this.positions.subarray(i * 3, i * 3 + 3) as vec3);
      this.velViews[i] = (this.velocities.subarray(i * 3, i * 3 + 3) as vec3);
    }
  }
}
