import { describe, expect, it } from 'vitest';
import { SpatialHash } from '../src/index.js';

function collectPairs(hash: SpatialHash): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  hash.queryPairs((i, j) => pairs.push([i, j]));
  return pairs;
}

describe('SpatialHash', () => {
  it('rejects a non-positive cell size', () => {
    expect(() => new SpatialHash(0)).toThrow();
    expect(() => new SpatialHash(-1)).toThrow();
  });

  it('pairs bodies in the same cell', () => {
    const hash = new SpatialHash(1);
    hash.insert(0, 0.1, 0.1, 0.1);
    hash.insert(1, 0.9, 0.9, 0.9);
    expect(collectPairs(hash)).toEqual([[0, 1]]);
  });

  it('pairs bodies in adjacent cells', () => {
    const hash = new SpatialHash(1);
    hash.insert(0, 0.9, 0.1, 0.1); // cell (0,0,0)
    hash.insert(1, 1.1, 0.1, 0.1); // cell (1,0,0)
    expect(collectPairs(hash)).toEqual([[0, 1]]);
  });

  it('ignores bodies beyond the 27-cell neighborhood', () => {
    const hash = new SpatialHash(1);
    hash.insert(0, 0.1, 0.1, 0.1);
    hash.insert(1, 5.1, 5.1, 5.1);
    expect(collectPairs(hash)).toEqual([]);
  });

  it('handles negative coordinates', () => {
    const hash = new SpatialHash(1);
    hash.insert(0, -0.5, -0.5, -0.5);
    hash.insert(1, -0.6, -0.6, -0.6);
    expect(collectPairs(hash)).toEqual([[0, 1]]);
  });

  it('emits each unordered pair exactly once, i < j, never self-pairs', () => {
    const hash = new SpatialHash(1);
    // Cluster of four points all within the same neighborhood.
    for (let k = 0; k < 4; k += 1) {
      hash.insert(k, 0.1 * k, 0.1 * k, 0.1 * k);
    }
    const pairs = collectPairs(hash);
    const keys = pairs.map(([i, j]) => `${i},${j}`);
    expect(new Set(keys).size).toBe(keys.length); // no duplicates
    for (const [i, j] of pairs) {
      expect(i).toBeLessThan(j);
    }
    expect(pairs.length).toBe(6); // C(4,2)
  });

  it('is empty after clear()', () => {
    const hash = new SpatialHash(1);
    hash.insert(0, 0, 0, 0);
    hash.insert(1, 0.1, 0, 0);
    hash.clear();
    expect(collectPairs(hash)).toEqual([]);
  });
});
