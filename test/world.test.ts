import { describe, expect, it } from 'vitest';
import { World } from '../src/index.js';

const DT = 1 / 60;

describe('World', () => {
  it('integrates gravity with semi-implicit Euler', () => {
    const world = new World({ gravity: [0, -10, 0], groundY: null });
    const i = world.addParticle({ position: [0, 100, 0] });
    world.step(0.1);
    expect(world.velocities[i * 3 + 1]).toBeCloseTo(-1, 5);
    expect(world.positions[i * 3 + 1]).toBeCloseTo(99.9, 5);
  });

  it('leaves static (mass 0) bodies untouched', () => {
    const world = new World({ groundY: null });
    const i = world.addParticle({ position: [0, 5, 0], mass: 0 });
    for (let s = 0; s < 100; s += 1) world.step(DT);
    expect(world.positions[i * 3 + 1]).toBe(5);
    expect(world.velocities[i * 3 + 1]).toBe(0);
  });

  it('separates overlapping spheres exactly', () => {
    const world = new World({ gravity: [0, 0, 0], groundY: null, restitution: 0 });
    const a = world.addParticle({ position: [0, 0, 0], radius: 0.5 });
    const b = world.addParticle({ position: [0.7, 0, 0], radius: 0.5 });
    world.step(DT);
    const dx = world.positions[b * 3] - world.positions[a * 3];
    expect(dx).toBeCloseTo(1.0, 3); // pushed apart to exactly r_a + r_b
  });

  it('swaps velocities in a head-on elastic collision of equal masses', () => {
    const world = new World({ gravity: [0, 0, 0], groundY: null, restitution: 1 });
    const a = world.addParticle({ position: [0, 0, 0], radius: 0.5, velocity: [1, 0, 0] });
    const b = world.addParticle({ position: [0.9, 0, 0], radius: 0.5, velocity: [-1, 0, 0] });
    world.step(DT);
    expect(world.velocities[a * 3]).toBeCloseTo(-1, 3);
    expect(world.velocities[b * 3]).toBeCloseTo(1, 3);
  });

  it('conserves momentum in a free elastic collision', () => {
    const world = new World({ gravity: [0, 0, 0], groundY: null, restitution: 1 });
    world.addParticle({ position: [0, 0, 0], radius: 0.5, velocity: [2, 0, 0], mass: 1 });
    world.addParticle({ position: [0.9, 0, 0], radius: 0.5, velocity: [0, 0, 0], mass: 3 });
    const momentum = () =>
      1 * world.velocities[0] + 3 * world.velocities[3];
    const before = momentum();
    world.step(DT);
    expect(momentum()).toBeCloseTo(before, 3);
  });

  it('drops a ball onto the ground plane and lets it rest', () => {
    const world = new World({ restitution: 0 });
    const i = world.addParticle({ position: [0, 3, 0], radius: 0.5 });
    let minY = Infinity;
    for (let s = 0; s < 600; s += 1) {
      world.step(DT);
      minY = Math.min(minY, world.positions[i * 3 + 1]);
    }
    const finalY = world.positions[i * 3 + 1];
    expect(minY).toBeGreaterThan(0.49); // never tunneled through the floor
    expect(finalY).toBeCloseTo(0.5, 2); // resting at exactly radius height
  });

  it('keeps bodies inside AABB bounds and reflects their velocity', () => {
    const world = new World({
      gravity: [0, 0, 0],
      groundY: null,
      restitution: 1,
      bounds: { min: [-2, -2, -2], max: [2, 2, 2] },
    });
    const i = world.addParticle({ position: [1.9, 0, 0], radius: 0.5, velocity: [5, 0, 0] });
    world.step(DT); // would escape to x = 1.983 + contact, wall at x = 1.5
    expect(world.positions[i * 3]).toBeLessThanOrEqual(1.5 + 1e-6);
    expect(world.velocities[i * 3]).toBeLessThan(0); // reflected

    // long run: never escapes, any axis
    const j = world.addParticle({ position: [0, 0, 0], radius: 0.4, velocity: [7, -9, 11] });
    for (let s = 0; s < 600; s += 1) {
      world.step(DT);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(Math.abs(world.positions[j * 3 + axis])).toBeLessThanOrEqual(2 - 0.4 + 1e-4);
      }
    }
  });

  it('grows capacity without losing state', () => {
    const world = new World({ capacity: 2, gravity: [0, 0, 0], groundY: null });
    world.addParticle({ position: [1, 2, 3] });
    world.addParticle({ position: [4, 5, 6] });
    world.addParticle({ position: [7, 8, 9] }); // forces growth from 2 -> 4
    world.addParticle({ position: [10, 11, 12] });
    expect(world.count).toBe(4);
    expect([...world.positions.subarray(0, 12)]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    world.step(DT); // should not throw; stale views would corrupt state
    expect([...world.positions.subarray(0, 12)]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });
});
