/**
 * Distance functions for vector spaces, ported from FLANN's
 * algorithms/dist.h (the originals reached this repo inside
 * AtypicalDistances.h, contributed under MIT).
 *
 * FLANN — Fast Library for Approximate Nearest Neighbors
 * Copyright (c) 2008-2011  Marius Muja (mariusm@cs.ubc.ca). All rights reserved.
 * Copyright (c) 2008-2011  David G. Lowe (lowe@cs.ubc.ca). All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
 * EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
 * BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * Port notes: the C++ manual 4x loop unrolling was dropped (modern JITs
 * vectorize simple loops); `worstDist` early-exit semantics are preserved.
 * `accumDist` below holds the per-dimension partial distances used by
 * kd-tree descent; maxDistance intentionally has none (L-infinity is not
 * dimensionwise-additive, so it is not a valid kd-tree distance).
 */

export type Vector = ArrayLike<number>;

/** Squared Euclidean distance (square root omitted for efficiency). */
export function l2Squared(a: Vector, b: Vector, size = a.length, worstDist = -1): number {
  let result = 0;
  for (let i = 0; i < size; i += 1) {
    const diff = a[i] - b[i];
    result += diff * diff;
    if (worstDist > 0 && result > worstDist) return result;
  }
  return result;
}

/** Squared Euclidean distance for exactly 3D points. */
export function l2Squared3D(a: Vector, b: Vector): number {
  const d0 = a[0] - b[0];
  const d1 = a[1] - b[1];
  const d2 = a[2] - b[2];
  return d0 * d0 + d1 * d1 + d2 * d2;
}

/** Manhattan (L1) distance. */
export function l1Distance(a: Vector, b: Vector, size = a.length, worstDist = -1): number {
  let result = 0;
  for (let i = 0; i < size; i += 1) {
    result += Math.abs(a[i] - b[i]);
    if (worstDist > 0 && result > worstDist) return result;
  }
  return result;
}

/** Minkowski (L_p) distance of the given order. */
export function minkowskiDistance(
  a: Vector,
  b: Vector,
  order: number,
  size = a.length,
  worstDist = -1,
): number {
  let result = 0;
  for (let i = 0; i < size; i += 1) {
    result += Math.pow(Math.abs(a[i] - b[i]), order);
    if (worstDist > 0 && result > worstDist) return result;
  }
  return result;
}

/** Max distance (L-infinity). Not dimensionwise-additive: no kd-tree partial. */
export function maxDistance(a: Vector, b: Vector, size = a.length, worstDist = -1): number {
  let result = 0;
  for (let i = 0; i < size; i += 1) {
    const diff = Math.abs(a[i] - b[i]);
    if (diff > result) result = diff;
    if (worstDist > 0 && result > worstDist) return result;
  }
  return result;
}

/** Histogram intersection distance. */
export function histIntersectionDistance(
  a: Vector,
  b: Vector,
  size = a.length,
  worstDist = -1,
): number {
  let result = 0;
  for (let i = 0; i < size; i += 1) {
    result += Math.min(a[i], b[i]);
    if (worstDist > 0 && result > worstDist) return result;
  }
  return result;
}

/** Hellinger distance. */
export function hellingerDistance(a: Vector, b: Vector, size = a.length): number {
  let result = 0;
  for (let i = 0; i < size; i += 1) {
    const diff = Math.sqrt(a[i]) - Math.sqrt(b[i]);
    result += diff * diff;
  }
  return result;
}

/** Chi-square distance. */
export function chiSquareDistance(a: Vector, b: Vector, size = a.length, worstDist = -1): number {
  let result = 0;
  for (let i = 0; i < size; i += 1) {
    const sum = a[i] + b[i];
    if (sum > 0) {
      const diff = a[i] - b[i];
      result += (diff * diff) / sum;
    }
    if (worstDist > 0 && result > worstDist) return result;
  }
  return result;
}

/** Kullback–Leibler divergence. */
export function klDivergence(a: Vector, b: Vector, size = a.length, worstDist = -1): number {
  let result = 0;
  for (let i = 0; i < size; i += 1) {
    if (a[i] !== 0 && b[i] !== 0) {
      const ratio = a[i] / b[i];
      if (ratio > 0) {
        result += a[i] * Math.log(ratio);
      }
    }
    if (worstDist > 0 && result > worstDist) return result;
  }
  return result;
}

/** Per-dimension partial distances, as used by kd-tree traversal. */
export const accumDist = {
  l2: (a: number, b: number): number => (a - b) * (a - b),
  l1: (a: number, b: number): number => Math.abs(a - b),
  minkowski: (a: number, b: number, order: number): number => Math.pow(Math.abs(a - b), order),
  histIntersection: (a: number, b: number): number => Math.min(a, b),
  hellinger: (a: number, b: number): number => {
    const d = Math.sqrt(a) - Math.sqrt(b);
    return d * d;
  },
  chiSquare: (a: number, b: number): number => {
    const sum = a + b;
    return sum > 0 ? ((a - b) * (a - b)) / sum : 0;
  },
  kl: (a: number, b: number): number => {
    if (a === 0 || b === 0) return 0;
    const ratio = a / b;
    return ratio > 0 ? a * Math.log(ratio) : 0;
  },
} as const;
