/**
 * Z-order (Morton order) utilities: locality-preserving interleaving of
 * integer coordinates into a single sortable key. Nearby points in space
 * tend to have nearby keys — handy for cache-friendly spatial buckets.
 *
 * Ported from the portable parts of ZOrderDistances.h (contributed to this
 * repo under MIT). The original's Unreal-Engine-coupled experimental parts
 * (FRotator3d, quaternion voxel packing) were intentionally not ported.
 *
 * References:
 *  - G. M. Morton, "A Computer Oriented Geodetic Data Base; and a New
 *    Technique in File Sequencing", IBM, 1966.
 *  - libmorton (Jeroen Baert, MIT) — reference implementation:
 *    https://github.com/Forceflow/libmorton
 *  - Moser–de Bruijn sequence:
 *    https://en.wikipedia.org/wiki/Moser%E2%80%93de_Bruijn_sequence
 *
 * See THIRD_PARTY_NOTICES.md.
 */

/** Interleave one bit each of x, y, z: x lands on bit 2, y on bit 1, z on bit 0. */
export function zInterleave(x: number, y: number, z: number): number {
  return ((x & 1) << 2) | ((y & 1) << 1) | (z & 1);
}

/** Spread the low 16 bits of n so each bit sits at an even position. */
function part1by1(n: number): number {
  n &= 0x0000ffff;
  n = (n | (n << 8)) & 0x00ff00ff;
  n = (n | (n << 4)) & 0x0f0f0f0f;
  n = (n | (n << 2)) & 0x33333333;
  n = (n | (n << 1)) & 0x55555555;
  return n >>> 0;
}

/** Inverse of part1by1: gather even-positioned bits back into the low 16. */
function compact1by1(n: number): number {
  n &= 0x55555555;
  n = (n ^ (n >>> 1)) & 0x33333333;
  n = (n ^ (n >>> 2)) & 0x0f0f0f0f;
  n = (n ^ (n >>> 4)) & 0x00ff00ff;
  n = (n ^ (n >>> 8)) & 0x0000ffff;
  return n >>> 0;
}

/** Morton-encode two 16-bit coordinates into a 32-bit key (x on even bits). */
export function morton2D(x: number, y: number): number {
  return (part1by1(x) | (part1by1(y) << 1)) >>> 0;
}

/** Decode a morton2D key back into [x, y]. */
export function demorton2D(key: number): [number, number] {
  return [compact1by1(key), compact1by1(key >>> 1)];
}

/** 21 bits per axis is the most a 63-bit 3D key can hold. */
const MASK_21_BIT = 0x1fffffn;

/** Spread the low 21 bits of n so each bit sits at a position divisible by 3. */
function part1by2(n: bigint): bigint {
  n &= MASK_21_BIT;
  n = (n | (n << 32n)) & 0x1f00000000ffffn;
  n = (n | (n << 16n)) & 0x1f0000ff0000ffn;
  n = (n | (n << 8n)) & 0x100f00f00f00f00fn;
  n = (n | (n << 4n)) & 0x10c30c30c30c30c3n;
  n = (n | (n << 2n)) & 0x1249249249249249n;
  return n;
}

/** Inverse of part1by2. */
function compact1by2(n: bigint): bigint {
  n &= 0x1249249249249249n;
  n = (n ^ (n >> 2n)) & 0x10c30c30c30c30c3n;
  n = (n ^ (n >> 4n)) & 0x100f00f00f00f00fn;
  n = (n ^ (n >> 8n)) & 0x1f0000ff0000ffn;
  n = (n ^ (n >> 16n)) & 0x1f00000000ffffn;
  n = (n ^ (n >> 32n)) & MASK_21_BIT;
  return n;
}

/** Morton-encode three 21-bit coordinates into a 63-bit key (x on bits 0,3,6…). */
export function morton3D(x: number, y: number, z: number): bigint {
  return part1by2(BigInt(x)) | (part1by2(BigInt(y)) << 1n) | (part1by2(BigInt(z)) << 2n);
}

/** Decode a morton3D key back into [x, y, z]. */
export function demorton3D(key: bigint): [number, number, number] {
  return [
    Number(compact1by2(key)),
    Number(compact1by2(key >> 1n)),
    Number(compact1by2(key >> 2n)),
  ];
}
