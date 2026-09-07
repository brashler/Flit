/**
 * SpatialHash — a uniform grid hash for 3D points.
 *
 * This is the Euclidean cousin in the LSH family: where MinHash buckets
 * documents by Jaccard similarity, this buckets positions by quantized
 * coordinates, so nearby points collide in the same bucket. Hash mixing
 * follows Teschner et al., "Optimized Spatial Hashing for Collision
 * Detection of Deformable Objects" (2003).
 *
 * Lifecycle per frame: clear() -> insert() everything -> queryPairs().
 * Rebuilding from scratch each step is O(n) and keeps the structure
 * GPU-shaped (flat data in, flat pairs out — a future compute backend
 * can swap the Maps for sorted arrays without touching callers).
 */
export class SpatialHash {
  /** Width of one cubic grid cell. Rule of thumb: ~2x the largest body radius. */
  public cellSize: number;

  /** Cell hash -> body indices in that cell. */
  private readonly cells = new Map<number, number[]>();

  /** Cell hash -> integer grid coords (the xor-mixed key is not invertible). */
  private readonly cellCoords = new Map<number, [number, number, number]>();

  constructor(cellSize = 1) {
    if (!(cellSize > 0)) {
      throw new Error('`cellSize` must be positive');
    }
    this.cellSize = cellSize;
  }

  public clear(): void {
    this.cells.clear();
    this.cellCoords.clear();
  }

  /** Insert a body index at a position. */
  public insert(index: number, x: number, y: number, z: number): void {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const key = SpatialHash.keyFromCoords(cx, cy, cz);

    const bucket = this.cells.get(key);
    if (bucket) {
      bucket.push(index);
    } else {
      this.cells.set(key, [index]);
      this.cellCoords.set(key, [cx, cy, cz]);
    }
  }

  /**
   * Emit every unordered pair (i, j) with i < j whose bodies share at
   * least one of the 27 neighboring cells. Sharing a cell is necessary
   * but not sufficient for contact — exact distance checks belong to
   * the narrowphase.
   */
  public queryPairs(emit: (i: number, j: number) => void): void {
    for (const [key, bucket] of this.cells) {
      const coords = this.cellCoords.get(key);
      if (!coords) continue; // unreachable, but keeps TS honest without `!`
      const [cx, cy, cz] = coords;

      for (const i of bucket) {
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dz = -1; dz <= 1; dz += 1) {
              const other = this.cells.get(SpatialHash.keyFromCoords(cx + dx, cy + dy, cz + dz));
              if (!other) continue;
              for (const j of other) {
                if (j > i) emit(i, j);
              }
            }
          }
        }
      }
    }
  }

  /** Large primes keep cell coords from aliasing; `| 0` keeps us in int32 land. */
  private static keyFromCoords(cx: number, cy: number, cz: number): number {
    return ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) | 0;
  }
}
