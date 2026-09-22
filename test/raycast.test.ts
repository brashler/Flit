import { describe, expect, it } from 'vitest';
import { World } from '../src/index.js';

function worldWith(...specs: Array<Parameters<World['addParticle']>[0]>): World {
  const world = new World({ gravity: [0, 0, 0], groundY: null });
  for (const spec of specs) world.addParticle(spec);
  return world;
}

describe('raycast (Amanatides-Woo over the broadphase grid)', () => {
  it('returns sorted hits with distances, points and normals', () => {
    const world = worldWith(
      { position: [3, 0, 0], radius: 0.5 },
      { position: [6, 0, 0], radius: 0.5 },
    );
    const hits = world.raycast([0, 0, 0], [1, 0, 0]);
    expect(hits).toHaveLength(2);
    expect(hits[0].index).toBe(0);
    expect(hits[0].distance).toBeCloseTo(2.5, 4);
    expect(hits[0].point[0]).toBeCloseTo(2.5, 4);
    expect(hits[0].normal[0]).toBeCloseTo(-1, 4);
    expect(hits[1].index).toBe(1);
    expect(hits[1].distance).toBeCloseTo(5.5, 4);
  });

  it('accepts non-normalized directions', () => {
    const world = worldWith({ position: [3, 0, 0], radius: 0.5 });
    const hits = world.raycast([0, 0, 0], [7, 0, 0]);
    expect(hits).toHaveLength(1);
    expect(hits[0].distance).toBeCloseTo(2.5, 4);
  });

  it('returns nothing on a miss', () => {
    const world = worldWith({ position: [3, 0, 0], radius: 0.5 });
    expect(world.raycast([0, 0, 0], [0, 1, 0])).toEqual([]);
  });

  it('tests a sphere spanning multiple cells exactly once', () => {
    // cellSize = 2 * maxRadius = 1, sphere at x=0.5 r=0.5 straddles cells 0 and 1
    const world = worldWith({ position: [0.5, 0, 0], radius: 0.5 });
    const hits = world.raycast([-3, 0, 0], [1, 0, 0]);
    expect(hits).toHaveLength(1);
    expect(hits[0].distance).toBeCloseTo(3, 4);
  });

  it('respects maxDistance', () => {
    const world = worldWith(
      { position: [3, 0, 0], radius: 0.5 },
      { position: [6, 0, 0], radius: 0.5 },
    );
    expect(world.raycast([0, 0, 0], [1, 0, 0], 2)).toEqual([]);
    expect(world.raycast([0, 0, 0], [1, 0, 0], 3)).toHaveLength(1);
  });

  it('reports a t=0 hit when the origin is inside a sphere', () => {
    const world = worldWith({ position: [3, 0, 0], radius: 1 });
    const hits = world.raycast([3, 0, 0], [1, 0, 0]);
    expect(hits).toHaveLength(1);
    expect(hits[0].distance).toBe(0);
  });

  it('hits spheres off-axis within the walked voxels', () => {
    const world = worldWith({ position: [3, 0.4, 0], radius: 0.5 });
    const hits = world.raycast([0, 0, 0], [1, 0, 0]);
    expect(hits).toHaveLength(1);
    expect(hits[0].distance).toBeCloseTo(3 - Math.sqrt(0.25 - 0.16), 4);
  });

  it('walks negative directions as well as positive', () => {
    const world = worldWith(
      { position: [-3, 0, 0], radius: 0.5 },
      { position: [0, -6, 0], radius: 0.5 },
      { position: [0, 0, -9], radius: 0.5 },
    );
    expect(world.raycast([0, 0, 0], [-1, 0, 0])[0].distance).toBeCloseTo(2.5, 4);
    expect(world.raycast([0, 0, 0], [0, -1, 0])[0].distance).toBeCloseTo(5.5, 4);
    expect(world.raycast([0, 0, 0], [0, 0, -1])[0].distance).toBeCloseTo(8.5, 4);
  });

  it('ignores spheres behind the origin', () => {
    const world = worldWith({ position: [-3, 0, 0], radius: 0.5 });
    expect(world.raycast([0, 0, 0], [1, 0, 0])).toEqual([]);
  });

  it('returns nothing for a degenerate direction', () => {
    const world = worldWith({ position: [1, 0, 0], radius: 0.5 });
    expect(world.raycast([0, 0, 0], [0, 0, 0])).toEqual([]);
  });

  it('includes a hit landing exactly at maxDistance', () => {
    const world = worldWith({ position: [3, 0, 0], radius: 0.5 });
    expect(world.raycast([0, 0, 0], [1, 0, 0], 2.5)).toHaveLength(1);
    expect(world.raycast([0, 0, 0], [1, 0, 0], 2.499)).toEqual([]);
  });

  it('reaches spheres stored in clamped boundary cells', () => {
    // cellSize = 1; x=600 lies past the 10-bit grid edge (+511), so the body
    // is clamped into boundary cell 511 -- the walk must still find it.
    const world = worldWith({ position: [600, 0, 0], radius: 0.5 });
    const hits = world.raycast([0, 0, 0], [1, 0, 0]);
    expect(hits).toHaveLength(1);
    expect(hits[0].distance).toBeCloseTo(599.5, 3);
  });

  it('catches a sphere bulging into the walked cell from a neighbor cell', () => {
    // Center at (0.9, 0.5, 0.5) lives in cell (0,0,0) (cellSize = 1), but its
    // surface reaches x=1.4 inside cell (1,0,0). A ray threaded through that
    // bulge never enters the center cell -- and must still hit.
    const world = worldWith({ position: [0.9, 0.5, 0.5], radius: 0.5 });
    const hits = world.raycast([1.35, -5, 0.5], [0, 1, 0]);
    expect(hits).toHaveLength(1);
    const halfChord = Math.sqrt(0.25 - 0.45 * 0.45);
    expect(hits[0].distance).toBeCloseTo(5 + (0.5 - halfChord), 4);
  });
});

/** mulberry32 -- tiny deterministic PRNG for scene generation. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec {
  position: [number, number, number];
  radius: number;
}

/**
 * Independent O(N) oracle: quadratic ray-sphere over every body, a different
 * code path from the engine's tca/thc voxel-walk. Distance ties broken by
 * index on both sides so comparison is deterministic.
 */
function bruteForce(
  world: World,
  specs: Spec[],
  origin: [number, number, number],
  direction: [number, number, number],
  maxDistance: number,
): Array<{ index: number; distance: number }> {
  const len = Math.hypot(direction[0], direction[1], direction[2]);
  if (len < 1e-12) return [];
  const dx = direction[0] / len;
  const dy = direction[1] / len;
  const dz = direction[2] / len;
  const hits: Array<{ index: number; distance: number }> = [];
  for (let i = 0; i < specs.length; i += 1) {
    const cx = world.positions[i * 3];
    const cy = world.positions[i * 3 + 1];
    const cz = world.positions[i * 3 + 2];
    const r = specs[i].radius;
    const ocx = origin[0] - cx;
    const ocy = origin[1] - cy;
    const ocz = origin[2] - cz;
    const b = 2 * (dx * ocx + dy * ocy + dz * ocz);
    const c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
    const disc = b * b - 4 * c;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    const tNear = (-b - sq) / 2;
    const tFar = (-b + sq) / 2;
    let t: number;
    if (tNear >= 0) t = tNear;
    else if (tFar > 0) t = 0; // origin inside
    else continue; // behind
    if (t > maxDistance) continue;
    hits.push({ index: i, distance: t });
  }
  hits.sort((a, b2) => a.distance - b2.distance || a.index - b2.index);
  return hits;
}

describe('raycast vs brute-force oracle (seeded differential)', () => {
  const rand = mulberry32(0x5eed);
  const specs: Spec[] = [];
  const world = new World({ gravity: [0, 0, 0], groundY: null });
  for (let i = 0; i < 150; i += 1) {
    const spec: Spec = {
      position: [(rand() - 0.5) * 20, (rand() - 0.5) * 20, (rand() - 0.5) * 20],
      radius: 0.2 + rand() * 0.4,
    };
    specs.push(spec);
    world.addParticle(spec);
  }
  world.syncBroadphase();

  it('500 random rays: identical hit lists, distances within 1e-3', () => {
    for (let k = 0; k < 500; k += 1) {
      const origin: [number, number, number] = [
        (rand() - 0.5) * 24,
        (rand() - 0.5) * 24,
        (rand() - 0.5) * 24,
      ];
      const direction: [number, number, number] = [
        rand() - 0.5,
        rand() - 0.5,
        rand() - 0.5,
      ];
      const maxDistance = k % 5 === 0 ? 5 + rand() * 10 : Infinity;

      const got = world
        .raycast(origin, direction, maxDistance)
        .map((h) => ({ index: h.index, distance: h.distance }));
      got.sort((a, b) => a.distance - b.distance || a.index - b.index);
      const want = bruteForce(world, specs, origin, direction, maxDistance);

      expect(got.map((h) => h.index)).toEqual(want.map((h) => h.index));
      for (let h = 0; h < got.length; h += 1) {
        expect(got[h].distance).toBeCloseTo(want[h].distance, 3);
      }
    }
  });
});
