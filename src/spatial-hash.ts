import { demorton3D_10, morton3D_10 } from './morton.js';

/**
 * SpatialHash — a uniform grid hash for 3D points, keyed by Morton (Z-order)
 * codes of the grid cells.
 *
 * This is the Euclidean cousin in the LSH family: where MinHash buckets
 * documents by Jaccard similarity, this buckets positions by quantized
 * coordinates, so nearby points collide in the same bucket. Morton keys are
 * invertible (no side table needed), collision-free within range, and
 * locality-ordered — the same keys a sorted-array GPU backend would use.
 *
 * Keys use the 10-bit-per-axis fast path (plain 32-bit ops on JS numbers).
 * The 21-bit BigInt variant in morton.ts measured ~13x slower here and is
 * only worth it for worlds wider than ±511 cells from the origin; positions
 * past the edge are clamped into boundary cells, which can only produce
 * extra candidate pairs (false positives the narrowphase discards), never
 * drop true ones.
 *
 * Lifecycle per frame: clear() -> insert() everything -> queryPairs().
 */
export class SpatialHash {
  /** Width of one cubic grid cell. Rule of thumb: ~2x the largest body radius. */
  public cellSize: number;

  /** Morton key of cell -> body indices in that cell. */
  private readonly cells = new Map<number, number[]>();

  private static readonly COORD_BIAS = 1 << 9; // 512: coords live in [0, 1023]
  private static readonly MAX_COORD = 0x3ff; // 10 bits per axis

  constructor(cellSize = 1) {
    if (!(cellSize > 0)) {
      throw new Error('`cellSize` must be positive');
    }
    this.cellSize = cellSize;
  }

  public clear(): void {
    this.cells.clear();
  }

  /** Insert a body index at a position. */
  public insert(index: number, x: number, y: number, z: number): void {
    const key = this.keyFor(x, y, z);
    const bucket = this.cells.get(key);
    if (bucket) {
      bucket.push(index);
    } else {
      this.cells.set(key, [index]);
    }
  }

  /**
   * Emit every unordered pair (i, j) with i < j whose bodies share at
   * least one of the 27 neighboring cells. Sharing a cell is necessary
   * but not sufficient for contact — exact distance checks belong to
   * the narrowphase.
   *
   * Ordered probing: each unordered cell-pair is visited exactly once,
   * from the lower-keyed cell (neighbor key > cell key), plus one pass
   * for the cell itself. This roughly halves the probe count versus
   * gathering the full 27-neighborhood per body and needs no scratch
   * allocations.
   */
  public queryPairs(emit: (i: number, j: number) => void): void {
    for (const [key, bucket] of this.cells) {
      const [cx, cy, cz] = demorton3D_10(key);

      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx;
        if (nx < 0 || nx > SpatialHash.MAX_COORD) continue;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = cy + dy;
          if (ny < 0 || ny > SpatialHash.MAX_COORD) continue;
          for (let dz = -1; dz <= 1; dz += 1) {
            const nz = cz + dz;
            if (nz < 0 || nz > SpatialHash.MAX_COORD) continue;

            const nkey = morton3D_10(nx, ny, nz);
            if (nkey < key) continue; // already processed from the other side
            const other = this.cells.get(nkey);
            if (!other) continue;

            if (nkey === key) {
              // Same cell: unordered pairs within the bucket.
              for (let a = 0; a < bucket.length - 1; a += 1) {
                for (let b = a + 1; b < bucket.length; b += 1) {
                  const i = bucket[a];
                  const j = bucket[b];
                  if (i < j) emit(i, j);
                  else emit(j, i);
                }
              }
            } else {
              // Cross cell: every pairing, exactly once.
              for (const i of bucket) {
                for (const j of other) {
                  if (i < j) emit(i, j);
                  else emit(j, i);
                }
              }
            }
          }
        }
      }
    }
  }

  private keyFor(x: number, y: number, z: number): number {
    return morton3D_10(
      SpatialHash.clampCoord(Math.floor(x / this.cellSize) + SpatialHash.COORD_BIAS),
      SpatialHash.clampCoord(Math.floor(y / this.cellSize) + SpatialHash.COORD_BIAS),
      SpatialHash.clampCoord(Math.floor(z / this.cellSize) + SpatialHash.COORD_BIAS),
    );
  }

  private static clampCoord(coord: number): number {
    if (coord < 0) return 0;
    if (coord > SpatialHash.MAX_COORD) return SpatialHash.MAX_COORD;
    return coord;
  }
}
