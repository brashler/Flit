import { describe, expect, it } from 'vitest';
import {
  TENSLICE,
  bitsToFloat,
  floatFlipBits,
  floatToBits,
  hamming32,
  hamming64,
  inverseFloatFlipBits,
  popcount32,
} from '../src/index.js';

describe('bit-utils', () => {
  it('has a ten-bit tenslice mask', () => {
    expect(popcount32(TENSLICE)).toBe(10);
  });

  it('bit-casts floats losslessly', () => {
    expect(floatToBits(1)).toBe(0x3f800000);
    expect(floatToBits(-2)).toBe(0xc0000000);
    // The bit cast goes through float32, so compare against the f32 rounding.
    for (const f of [0, 1, -2.5, 3.14159, 1e30, -1e-30]) {
      expect(bitsToFloat(floatToBits(f))).toBe(Math.fround(f));
    }
  });

  it('float flip round-trips', () => {
    const patterns = [0, 1, 0x3f800000, 0xc0000000, 0x7f7fffff, 0xff7fffff, 0xdeadbeef];
    for (const bits of patterns) {
      expect(inverseFloatFlipBits(floatFlipBits(bits))).toBe(bits >>> 0);
    }
  });

  it('flipped keys sort like the original floats', () => {
    const floats = [-1e30, -42.75, -1, -0.5, 0, 0.5, 1, 3.25, 1e30];
    const keys = floats.map((f) => floatFlipBits(floatToBits(f)));
    const sorted = [...keys].sort((a, b) => a - b);
    expect(keys).toEqual(sorted); // floats were already ascending
  });

  it('counts bits', () => {
    expect(popcount32(0)).toBe(0);
    expect(popcount32(0xff)).toBe(8);
    expect(popcount32(0xffffffff)).toBe(32);
    expect(popcount32(0b10101010101010101010101010101010)).toBe(16);
  });

  it('computes hamming distances', () => {
    expect(hamming32(0b1010, 0b0110)).toBe(2);
    expect(hamming32(0, 0)).toBe(0);
    expect(hamming64(0n, 0n)).toBe(0);
    expect(hamming64(0xffffffffffffffffn, 0n)).toBe(64);
    expect(hamming64(0xdeadbeef00000000n, 0x00000000deadbeefn)).toBe(48);
  });
});
