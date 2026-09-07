import { describe, expect, it } from 'vitest';
import {
  demorton2D,
  demorton3D,
  demorton3D_10,
  hamming32,
  hamming64,
  morton2D,
  morton3D,
  morton3D_10,
  zInterleave,
} from '../src/index.js';

describe('zInterleave', () => {
  it('places x on bit 2, y on bit 1, z on bit 0', () => {
    expect(zInterleave(1, 1, 1)).toBe(7);
    expect(zInterleave(1, 0, 0)).toBe(4);
    expect(zInterleave(0, 1, 0)).toBe(2);
    expect(zInterleave(0, 0, 1)).toBe(1);
    expect(zInterleave(0, 0, 0)).toBe(0);
  });
});

describe('morton2D', () => {
  it('puts x on even bits and y on odd bits', () => {
    expect(morton2D(1, 0)).toBe(1);
    expect(morton2D(0, 1)).toBe(2);
    expect(morton2D(3, 0)).toBe(0b0101);
  });

  it('round-trips', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [1, 2],
      [0xffff, 0xffff],
      [0xabcd, 0x1234],
      [65535, 0],
    ];
    for (const [x, y] of cases) {
      expect(demorton2D(morton2D(x, y))).toEqual([x, y]);
    }
  });
});

describe('morton3D', () => {
  it('puts x, y, z on bits 0/1/2 mod 3', () => {
    expect(morton3D(1, 0, 0)).toBe(1n);
    expect(morton3D(0, 1, 0)).toBe(2n);
    expect(morton3D(0, 0, 1)).toBe(4n);
  });

  it('round-trips including 21-bit extremes', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 2, 3],
      [0x1fffff, 0x1fffff, 0x1fffff], // 21-bit max
      [0x1fffff, 12345, 999],
      [42, 0, 0x100000],
    ];
    for (const [x, y, z] of cases) {
      expect(demorton3D(morton3D(x, y, z))).toEqual([x, y, z]);
    }
  });

  it('is locality-preserving: adjacent cells differ by one bit', () => {
    const a = morton3D(100, 100, 100);
    const b = morton3D(101, 100, 100); // 100 and 101 differ in one bit
    expect(hamming64(a, b)).toBe(1);
  });
});

describe('morton3D_10 (30-bit number-key fast path)', () => {
  it('puts x, y, z on bits 0/1/2 mod 3', () => {
    expect(morton3D_10(1, 0, 0)).toBe(1);
    expect(morton3D_10(0, 1, 0)).toBe(2);
    expect(morton3D_10(0, 0, 1)).toBe(4);
    expect(morton3D_10(0, 0, 0)).toBe(0);
  });

  it('round-trips including 10-bit extremes', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 2, 3],
      [1023, 1023, 1023],
      [512, 0, 999],
      [1023, 1, 512],
    ];
    for (const [x, y, z] of cases) {
      expect(demorton3D_10(morton3D_10(x, y, z))).toEqual([x, y, z]);
    }
  });

  it('stays a positive 30-bit key', () => {
    const key = morton3D_10(1023, 1023, 1023);
    expect(key).toBe(0x3fffffff);
    expect(key).toBeGreaterThan(0);
  });

  it('is locality-preserving: adjacent cells differ by one bit', () => {
    const a = morton3D_10(100, 100, 100);
    const b = morton3D_10(101, 100, 100);
    expect(hamming32(a, b)).toBe(1);
  });
});
