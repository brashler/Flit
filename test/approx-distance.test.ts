import { describe, expect, it } from 'vitest';
import { diamondAngle, octagonalDistance, octagonalDistanceBetween } from '../src/index.js';

describe('octagonalDistance', () => {
  it('is exact on axis and on the 3-4-5 triangle', () => {
    expect(octagonalDistance(10, 0)).toBe(10);
    expect(octagonalDistance(0, 7)).toBe(7);
    expect(octagonalDistance(3, 4)).toBe(5);
  });

  it('matches the between-points overload', () => {
    expect(octagonalDistanceBetween(1, 1, 4, 5)).toBe(octagonalDistance(3, 4));
    expect(octagonalDistanceBetween(5, 5, 2, 1)).toBe(octagonalDistance(-3, -4));
  });

  it('stays within ~5% of true Euclidean distance at useful magnitudes', () => {
    // At tiny magnitudes the integer rounding dominates (e.g. sqrt(2) -> 1);
    // the ~4% error bound of the octagonal approximation applies once the
    // rounding term is negligible, so sweep distances >= 10.
    for (let dx = 10; dx < 500; dx += 47) {
      for (let dy = 10; dy < 500; dy += 53) {
        const approx = octagonalDistance(dx, dy);
        const exact = Math.hypot(dx, dy);
        expect(Math.abs(approx - exact) / exact).toBeLessThan(0.05);
      }
    }
  });
});

describe('diamondAngle', () => {
  it('walks the four quadrants in order', () => {
    expect(diamondAngle(1, 1)).toBeCloseTo(0.5, 10); // Q1
    expect(diamondAngle(1, -1)).toBeCloseTo(1.5, 10); // Q2
    expect(diamondAngle(-1, -1)).toBeCloseTo(2.5, 10); // Q3
    expect(diamondAngle(-1, 1)).toBeCloseTo(3.5, 10); // Q4
  });

  it('hits the axes at integer values', () => {
    expect(diamondAngle(0, 1)).toBe(0); // +x
    expect(diamondAngle(1, 0)).toBe(1); // +y
    expect(diamondAngle(0, -1)).toBe(2); // -x
    expect(diamondAngle(-1, 0)).toBe(3); // -y
  });
});
