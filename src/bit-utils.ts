/**
 * Bit utilities — float bit-flipping for radix sorts, popcount, Hamming distance.
 *
 * Ported from C++ headers contributed to this repo under MIT.
 * floatFlipBits/inverseFloatFlipBits implement the classic radix-sort float
 * ordering trick by Michael Herf (stereopsis.com, "RadixSort11").
 * See THIRD_PARTY_NOTICES.md.
 */

/** Ten low bits — handy mask when slicing Morton-style keys. */
export const TENSLICE = 0b00000000000000000000001111111111;

// Union views for bit-casting between float32 and uint32.
const _f32 = new Float32Array(1);
const _u32 = new Uint32Array(_f32.buffer);

export function floatToBits(f: number): number {
  _f32[0] = f;
  return _u32[0];
}

export function bitsToFloat(bits: number): number {
  _u32[0] = bits >>> 0;
  return _f32[0];
}

/**
 * Flip the bits of an IEEE-754 bit pattern so that an unsigned integer
 * ordering of the results matches the original float ordering:
 * sign set (negative float) -> flip all bits; sign clear -> flip sign only.
 */
export function floatFlipBits(bits: number): number {
  const mask = (-(bits >>> 31) | 0x80000000) | 0;
  return (bits ^ mask) >>> 0;
}

/** Inverse of floatFlipBits. */
export function inverseFloatFlipBits(bits: number): number {
  const mask = (((bits >>> 31) - 1) | 0x80000000) | 0;
  return (bits ^ mask) >>> 0;
}

/** Population count of a 32-bit integer (SWAR). */
export function popcount32(v: number): number {
  v = v >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Hamming distance between two 32-bit words: popcount(a ^ b). */
export function hamming32(a: number, b: number): number {
  return popcount32(a ^ b);
}

/** Hamming distance between two 64-bit words (as bigints). */
export function hamming64(a: bigint, b: bigint): number {
  let x = (a ^ b) & 0xffffffffffffffffn;
  let count = 0;
  while (x > 0n) {
    count += popcount32(Number(x & 0xffffffffn));
    x >>= 32n;
  }
  return count;
}
