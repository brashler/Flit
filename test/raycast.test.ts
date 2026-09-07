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
});
