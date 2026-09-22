/**
 * Heightfield — 2.5D terrain as a regular grid of height samples, no
 * meshing anywhere: height and normal are pure functions of (x, z), so
 * collision and raycast queries sample the field directly. Suited to
 * terrain-like slopes; it cannot represent overhangs (that is what
 * "2.5D" buys: every query stays O(1)-ish and allocation-free).
 *
 * Sampling: bilinear interpolation between posts; outside the sampled
 * region the edge row/column heights extend (clamped), so queries never
 * fail — they just stop being interesting.
 *
 * Scratch convention: contact() returns a module-level reused object
 * (consume it immediately, like the gl-matrix scratch vectors in
 * world.ts); raycast() allocates one TerrainHit per call, mirroring
 * World.raycast's per-hit allocation.
 */

export interface HeightfieldSpec {
  /** Sample counts per axis (posts), each >= 2. */
  rows: number;
  cols: number;
  /** World-space distance between neighboring posts. */
  cellSize: number;
  /** rows*cols heights in row-major order (row = z). Default all zero. */
  heights?: ArrayLike<number>;
  /** World position of sample (0, 0). Default [0, 0, 0]. */
  origin?: [number, number, number];
}

export interface TerrainHit {
  /** Distance along the (normalized) ray direction. */
  distance: number;
  point: [number, number, number];
  /** Up-facing surface normal at the hit point. */
  normal: [number, number, number];
}

/** Reused scratch for contact() — the hot collision path must not allocate. */
const _contact = { nx: 0, ny: 0, nz: 0, penetration: 0 };
const _normal = [0, 0, 0];

export class Heightfield {
  public readonly rows: number;
  public readonly cols: number;
  public readonly cellSize: number;
  public readonly heights: Float32Array;
  public readonly origin: [number, number, number];

  constructor(spec: HeightfieldSpec) {
    if (spec.rows < 2 || spec.cols < 2) {
      throw new Error('`rows` and `cols` must both be >= 2');
    }
    if (!(spec.cellSize > 0)) {
      throw new Error('`cellSize` must be positive');
    }
    if (spec.heights !== undefined && spec.heights.length !== spec.rows * spec.cols) {
      throw new Error('`heights` must have rows*cols entries');
    }
    this.rows = spec.rows;
    this.cols = spec.cols;
    this.cellSize = spec.cellSize;
    this.heights =
      spec.heights === undefined
        ? new Float32Array(spec.rows * spec.cols)
        : new Float32Array(spec.heights);
    this.origin = spec.origin ? [...spec.origin] : [0, 0, 0];
  }

  public setHeight(row: number, col: number, height: number): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      throw new Error(`setHeight out of range: (${row}, ${col})`);
    }
    this.heights[row * this.cols + col] = height;
  }

  /** Bilinear height at world (x, z); clamps to the edge outside the grid. */
  public heightAt(x: number, z: number): number {
    const u = (x - this.origin[0]) / this.cellSize;
    const v = (z - this.origin[2]) / this.cellSize;
    const cu = Math.min(Math.max(u, 0), this.cols - 1);
    const cv = Math.min(Math.max(v, 0), this.rows - 1);
    const i = Math.min(Math.floor(cu), this.cols - 2);
    const j = Math.min(Math.floor(cv), this.rows - 2);
    const fu = cu - i;
    const fv = cv - j;
    const k = j * this.cols + i;
    const h00 = this.heights[k];
    const h10 = this.heights[k + 1];
    const h01 = this.heights[k + this.cols];
    const h11 = this.heights[k + this.cols + 1];
    return (h00 * (1 - fu) + h10 * fu) * (1 - fv) + (h01 * (1 - fu) + h11 * fu) * fv;
  }

  /** Up-facing surface normal at world (x, z) via central differences. */
  public normalAt(x: number, z: number, out: number[]): number[] {
    const e = this.cellSize * 0.5;
    const dhdx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dhdz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    const invLen = 1 / Math.hypot(dhdx, 1, dhdz);
    out[0] = -dhdx * invLen;
    out[1] = invLen;
    out[2] = -dhdz * invLen;
    return out;
  }

  /**
   * Sphere contact against the local tangent plane directly below the
   * sphere center (the classic 2.5D approximation: exact on flats, a
   * good approximation on terrain-like slopes, blind to overhangs).
   * Returns the reused scratch object — consume immediately — or null.
   */
  public contact(
    px: number,
    py: number,
    pz: number,
    radius: number,
  ): typeof _contact | null {
    const h = this.heightAt(px, pz);
    this.normalAt(px, pz, _normal);
    // Signed distance from center to the tangent plane through (px, h, pz);
    // the horizontal offsets vanish because the sample shares (px, pz).
    // On slopes the resting center sits at py = h + r/n_y, ABOVE a vertical
    // r-check -- the plane distance d is the only valid rejection test.
    const d = (py - h) * _normal[1];
    if (d >= radius) return null;
    _contact.nx = _normal[0];
    _contact.ny = _normal[1];
    _contact.nz = _normal[2];
    _contact.penetration = radius - d;
    return _contact;
  }

  /**
   * Ray vs terrain: Amanatides-Woo walk over the grid columns in x/z
   * (the 2D shadow of World.raycast's 3D voxel walk), bisection refine
   * per crossed column. An origin on or below the surface reports t=0,
   * mirroring the sphere-inside convention. Bilinear patches can in
   * principle hide a dip between two above-surface samples; the
   * endpoint sign-flip test does not see it (documented approximation,
   * invisible for terrain-like fields).
   */
  public raycast(
    origin: [number, number, number],
    direction: [number, number, number],
    maxDistance = Infinity,
  ): TerrainHit | null {
    const dirLen = Math.hypot(direction[0], direction[1], direction[2]);
    if (dirLen < 1e-12) return null;
    const dx = direction[0] / dirLen;
    const dy = direction[1] / dirLen;
    const dz = direction[2] / dirLen;
    const ox = origin[0];
    const oy = origin[1];
    const oz = origin[2];

    const f = (t: number): number =>
      oy + dy * t - this.heightAt(ox + dx * t, oz + dz * t);

    const f0 = f(0);
    if (f0 <= 0) {
      return {
        distance: 0,
        point: [ox, oy, oz],
        normal: this.normalAt(ox, oz, [0, 0, 0]) as [number, number, number],
      };
    }

    if (Math.abs(dx) + Math.abs(dz) < 1e-12) {
      if (dy >= 0) return null; // straight up, above the surface
      const t = f0 / -dy;
      if (t > maxDistance) return null;
      return {
        distance: t,
        point: [ox, oy + dy * t, oz],
        normal: this.normalAt(ox, oz, [0, 0, 0]) as [number, number, number],
      };
    }

    const cs = this.cellSize;
    let cx = Math.floor((ox - this.origin[0]) / cs);
    let cz = Math.floor((oz - this.origin[2]) / cs);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(cs / dx) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(cs / dz) : Infinity;
    const borderX = this.origin[0] + (cx + (stepX > 0 ? 1 : 0)) * cs;
    const borderZ = this.origin[2] + (cz + (stepZ > 0 ? 1 : 0)) * cs;
    let tMaxX = dx !== 0 ? (borderX - ox) / dx : Infinity;
    let tMaxZ = dz !== 0 ? (borderZ - oz) / dz : Infinity;

    // Invariant: f(tEnter) > 0 (the origin check covers tEnter = 0, and we
    // only ever advance past a column whose exit sample was still positive).
    let tEnter = 0;
    for (let guard = 0; guard < 4096 && tEnter <= maxDistance; guard += 1) {
      const tExit = Math.min(tMaxX, tMaxZ);
      const fExit = f(tExit);
      if (fExit <= 0) {
        // Sign flip inside this column: bisect to the crossing.
        let lo = tEnter;
        let hi = tExit;
        for (let it = 0; it < 24; it += 1) {
          const mid = (lo + hi) * 0.5;
          if (f(mid) > 0) lo = mid;
          else hi = mid;
        }
        const t = (lo + hi) * 0.5;
        if (t > maxDistance) return null;
        const px = ox + dx * t;
        const pz = oz + dz * t;
        return {
          distance: t,
          point: [px, oy + dy * t, pz],
          normal: this.normalAt(px, pz, [0, 0, 0]) as unknown as [number, number, number],
        };
      }
      if (tMaxX <= tMaxZ) {
        tEnter = tMaxX;
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        tEnter = tMaxZ;
        tMaxZ += tDeltaZ;
        cz += stepZ;
      }
    }
    return null;
  }
}
