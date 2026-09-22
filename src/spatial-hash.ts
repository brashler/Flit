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

  /**
   * Coarse occupancy grid (4x4x4 fine cells per coarse cell): key -> live
   * body count. Lets voxel walks skip 27-neighborhood probes in
   * guaranteed-empty space (raycast filter). Built LAZILY from `cells` on
   * first use after a mutation and rebuilt whenever the grid changed --
   * simulations that never raycast pay nothing for it.
   */
  private readonly coarse = new Map<number, number>();
  private coarseDirty = true;

  private static readonly COORD_BIAS = 1 << 9; // 512: coords live in [0, 1023]
  private static readonly MAX_COORD = 0x3ff; // 10 bits per axis
  private static readonly COARSE_SHIFT = 2; // 2^2 fine cells per coarse axis

  constructor(cellSize = 1) {
    if (!(cellSize > 0)) {
      throw new Error('`cellSize` must be positive');
    }
    this.cellSize = cellSize;
  }

  public clear(): void {
    this.cells.clear();
    this.coarseDirty = true;
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
    this.coarseDirty = true;
  }

  /**
   * True if any coarse cell overlapping the (inclusive) fine-cell range
   * [f0..f1] holds at least one body. A false answer is a GUARANTEE of no
   * body centers in the range -- used to skip fine probes in empty space.
   */
  public coarseRegionOccupied(
    fx0: number,
    fy0: number,
    fz0: number,
    fx1: number,
    fy1: number,
    fz1: number,
  ): boolean {
    if (this.coarseDirty) this.rebuildCoarse();
    const b = SpatialHash.COORD_BIAS;
    const sh = SpatialHash.COARSE_SHIFT;
    const cx0 = SpatialHash.clampCoord(fx0 + b) >> sh;
    const cy0 = SpatialHash.clampCoord(fy0 + b) >> sh;
    const cz0 = SpatialHash.clampCoord(fz0 + b) >> sh;
    const cx1 = SpatialHash.clampCoord(fx1 + b) >> sh;
    const cy1 = SpatialHash.clampCoord(fy1 + b) >> sh;
    const cz1 = SpatialHash.clampCoord(fz1 + b) >> sh;
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        for (let cz = cz0; cz <= cz1; cz += 1) {
          if (this.coarse.has(morton3D_10(cx, cy, cz))) return true;
        }
      }
    }
    return false;
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
    return SpatialHash.keyFromCoords(
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize),
      Math.floor(z / this.cellSize),
    );
  }

  /** Coarse-grid key from BIASED fine coords (already bias-applied + clamped). */
  private static coarseKeyFromBiased(bx: number, by: number, bz: number): number {
    const sh = SpatialHash.COARSE_SHIFT;
    return morton3D_10(bx >> sh, by >> sh, bz >> sh);
  }

  /**
   * Rebuild the coarse occupancy counts from the live cell map. Coarse
   * keys come straight out of the fine Morton key with bit surgery: the
   * coarse grid drops the low 2 bits of each 10-bit axis field, and in a
   * dilated key those fields live 6 bit-positions apart, so the coarse
   * key is three masked shifts -- no de-lace, no tuple allocation.
   */
  private rebuildCoarse(): void {
    this.coarse.clear();
    // Masks, 30-bit morton3D_10 lane convention (x at 3i, y at 3i+1, z at
    // 3i+2): per-axis dilated fields and the 8 coarse bits per axis left
    // after dropping the low 2 fine bits (a 6-bit shift of the dilated key).
    const MX = 0x9249249;
    const MY = 0x12492492;
    const MZ = 0x24924924;
    const CX = 0x249249;
    const CY = 0x492492;
    const CZ = 0x924924;
    const shift = SpatialHash.COARSE_SHIFT * 3;
    for (const [key, bucket] of this.cells) {
      const coarseKey =
        (((key & MX) >> shift) & CX) | (((key & MY) >> shift) & CY) | (((key & MZ) >> shift) & CZ);
      this.coarse.set(coarseKey, (this.coarse.get(coarseKey) ?? 0) + bucket.length);
    }
    this.coarseDirty = false;
  }

  /**
   * Key for a cell given in UN-biased grid coords (applies bias + clamp).
   * queryPairs works on biased coords straight from demorton3D_10 and must
   * NOT use this — different input spaces.
   */
  private static keyFromCoords(cx: number, cy: number, cz: number): number {
    return morton3D_10(
      SpatialHash.clampCoord(cx + SpatialHash.COORD_BIAS),
      SpatialHash.clampCoord(cy + SpatialHash.COORD_BIAS),
      SpatialHash.clampCoord(cz + SpatialHash.COORD_BIAS),
    );
  }

  /** Bodies in a grid cell (un-biased coords), for voxel walks like raycasts. */
  public getCellBodies(cellX: number, cellY: number, cellZ: number): readonly number[] | undefined {
    return this.cells.get(SpatialHash.keyFromCoords(cellX, cellY, cellZ));
  }

  private static clampCoord(coord: number): number {
    if (coord < 0) return 0;
    if (coord > SpatialHash.MAX_COORD) return SpatialHash.MAX_COORD;
    return coord;
  }
}
