import { describe, expect, it } from 'vitest';
import {
  accumDist,
  chiSquareDistance,
  hellingerDistance,
  histIntersectionDistance,
  klDivergence,
  l1Distance,
  l2Squared,
  l2Squared3D,
  maxDistance,
  minkowskiDistance,
} from '../src/index.js';

describe('FLANN distance ports', () => {
  it('computes squared Euclidean distance', () => {
    expect(l2Squared([0, 0, 0], [1, 2, 2])).toBe(9);
    expect(l2Squared3D([0, 0, 0], [1, 2, 2])).toBe(9);
    expect(l2Squared([], [])).toBe(0);
  });

  it('honors worstDist early exit', () => {
    // result hits 5 after two dims; 5 > 4 -> bail out with 5
    expect(l2Squared([0, 0, 0], [1, 2, 2], 3, 4)).toBe(5);
  });

  it('computes L1', () => {
    expect(l1Distance([0, 0, 0], [1, 2, 2])).toBe(5);
  });

  it('computes Minkowski of order 3', () => {
    expect(minkowskiDistance([0, 0, 0], [1, 2, 2], 3)).toBe(17);
  });

  it('computes L-infinity', () => {
    expect(maxDistance([0, 0, 0], [1, 2, 2])).toBe(2);
  });

  it('computes histogram intersection', () => {
    expect(histIntersectionDistance([1, 2, 3], [2, 2, 2])).toBe(5);
  });

  it('computes Hellinger distance', () => {
    expect(hellingerDistance([1, 4], [1, 1])).toBe(1);
  });

  it('computes chi-square distance', () => {
    expect(chiSquareDistance([2, 4], [4, 2])).toBeCloseTo(4 / 3, 10);
    expect(chiSquareDistance([0, 4], [0, 2])).toBeCloseTo(2 / 3, 10); // zero sum dim skipped
  });

  it('computes KL divergence', () => {
    expect(klDivergence([0.5, 0.5], [0.25, 0.75])).toBeCloseTo(0.5 * Math.log(4 / 3), 10);
    expect(klDivergence([0, 1], [1, 1])).toBe(0); // zero entries skipped
  });

  it('exposes kd-tree partial distances', () => {
    expect(accumDist.l2(3, 1)).toBe(4);
    expect(accumDist.l1(3, 1)).toBe(2);
    expect(accumDist.minkowski(3, 1, 3)).toBe(8);
    expect(accumDist.histIntersection(3, 1)).toBe(1);
    expect(accumDist.hellinger(4, 1)).toBe(1);
    expect(accumDist.chiSquare(2, 4)).toBeCloseTo(2 / 3, 10);
    expect(accumDist.kl(0.5, 0.25)).toBeCloseTo(0.5 * Math.log(2), 10);
    expect(accumDist.kl(0, 1)).toBe(0);
  });
});
