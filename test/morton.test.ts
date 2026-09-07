import { describe, expect, it } from 'vitest';
import {
  demorton2D,
  demorton3D,
  hamming64,
  morton2D,
  morton3D,
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
