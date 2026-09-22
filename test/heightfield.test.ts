/**
 * Heightfield terrain: sampling (bilinear height, central-difference
 * normals), sphere collision through World (rest, settle, slide, static
 * bodies), and the DDA terrain raycast merged into World.raycast as
 * index -1. No meshing anywhere — everything samples the field.
 */
import { describe, expect, it } from 'vitest';

import { Heightfield } from '../src/heightfield.js';
import { World } from '../src/world.js';

const DT = 1 / 60;

/** Flat terrain at height h covering [-5, 5]^2. */
function flatField(h: number): Heightfield {
  return new Heightfield({ rows: 2, cols: 2, cellSize: 10, origin: [-5, 0, -5], heights: [h, h, h, h] });
}

/** The exact plane h(x, z) = x over x in [-5, 5]. */
function planeField(): Heightfield {
  const heights: number[] = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 11; col += 1) heights.push(col - 5);
  }
  return new Heightfield({ rows: 2, cols: 11, cellSize: 1, origin: [-5, 0, -0.5], heights });
}

describe('heightfield sampling', () => {
  it('is exact on posts and bilinear at cell midpoints', () => {
    const field = new Heightfield({
      rows: 2,
      cols: 2,
      cellSize: 2,
      heights: [0, 2, 4, 8], // h(0,0)=0, h(2,0)=2, h(0,2)=4, h(2,2)=8
    });
    expect(field.heightAt(0, 0)).toBe(0);
    expect(field.heightAt(2, 0)).toBe(2);
    expect(field.heightAt(0, 2)).toBe(4);
    expect(field.heightAt(2, 2)).toBe(8);
    expect(field.heightAt(1, 1)).toBeCloseTo((0 + 2 + 4 + 8) / 4, 5);
    expect(field.heightAt(1, 0)).toBeCloseTo(1, 5); // edge midpoint
  });

  it('extends edge heights outside the sampled region (clamps)', () => {
    const field = new Heightfield({ rows: 2, cols: 2, cellSize: 1, heights: [1, 2, 3, 4] });
    expect(field.heightAt(-10, 0.5)).toBeCloseTo(field.heightAt(0, 0.5), 5);
    expect(field.heightAt(10, 0.5)).toBeCloseTo(field.heightAt(1, 0.5), 5);
    expect(field.heightAt(0.5, -10)).toBeCloseTo(field.heightAt(0.5, 0), 5);
  });

  it('computes up-facing normals: flat and the 45-degree plane h = x', () => {
    const up = flatField(1).normalAt(0, 0, [0, 0, 0]);
    expect(up[0]).toBeCloseTo(0, 5);
    expect(up[1]).toBeCloseTo(1, 5);
    expect(up[2]).toBeCloseTo(0, 5);

    const n = planeField().normalAt(1.25, 0, [0, 0, 0]);
    expect(n[0]).toBeCloseTo(-Math.SQRT1_2, 4);
    expect(n[1]).toBeCloseTo(Math.SQRT1_2, 4);
    expect(n[2]).toBeCloseTo(0, 5);
  });

  it('validates the spec', () => {
    expect(() => new Heightfield({ rows: 1, cols: 2, cellSize: 1 })).toThrow();
    expect(() => new Heightfield({ rows: 2, cols: 2, cellSize: 0 })).toThrow();
    expect(() => new Heightfield({ rows: 2, cols: 2, cellSize: 1, heights: [1, 2, 3] })).toThrow();
  });
});

describe('heightfield collision (via World)', () => {
  it('a dropped ball rests on flat terrain and settles', () => {
    const world = new World({ groundY: null, restitution: 0.2, heightfield: flatField(2) });
    world.addParticle({ position: [0, 6, 0], radius: 0.5 });
    for (let s = 0; s < 180; s += 1) world.step(DT);
    expect(world.positions[1]).toBeCloseTo(2.5, 2);
    expect(world.isSettled(0)).toBe(true);
  });

  it('holds a ball on a moderate slope with friction', () => {
    const slope = new Heightfield({
      rows: 2,
      cols: 11,
      cellSize: 1,
      origin: [-5, 0, -0.5],
      heights: (() => {
        const hs: number[] = [];
        for (let r = 0; r < 2; r += 1) for (let c = 0; c < 11; c += 1) hs.push(0.5 * (c - 5));
        return hs;
      })(),
    });
    const world = new World({ groundY: null, restitution: 0, friction: 0.9, heightfield: slope });
    world.addParticle({ position: [0, 0.55, 0], radius: 0.5 }); // on the surface (h=0 here)
    for (let s = 0; s < 240; s += 1) world.step(DT);
    const x = world.positions[0];
    const y = world.positions[1];
    expect(Math.abs(x)).toBeLessThan(1.5); // slid a little, then held
    expect(y).toBeGreaterThan(0.5 * x + 0.3); // never tunneled
    expect(world.isSettled(0)).toBe(true);
  });

  it('lets a ball slide downhill on frictionless terrain', () => {
    const slope = new Heightfield({
      rows: 2,
      cols: 11,
      cellSize: 1,
      origin: [-5, 0, -0.5],
      heights: (() => {
        const hs: number[] = [];
        for (let r = 0; r < 2; r += 1) for (let c = 0; c < 11; c += 1) hs.push(0.5 * (c - 5));
        return hs;
      })(),
    });
    const world = new World({ groundY: null, restitution: 0, friction: 0, heightfield: slope });
    world.addParticle({ position: [0, 1.0, 0], radius: 0.5 });
    for (let s = 0; s < 120; s += 1) world.step(DT);
    const x = world.positions[0];
    expect(x).toBeLessThan(-0.5); // slid toward -x (downhill)
    expect(world.positions[1]).toBeGreaterThan(0.5 * x + 0.3); // stayed on top
  });

  it('never moves a static body, even one spawned inside the terrain', () => {
    const world = new World({ groundY: null, heightfield: flatField(2) });
    world.addParticle({ position: [0, 1, 0], radius: 0.5, mass: 0 });
    for (let s = 0; s < 10; s += 1) world.step(DT);
    expect(world.positions[1]).toBe(1);
  });
});

describe('heightfield raycast', () => {
  it('hits flat terrain straight down with an up normal', () => {
    const world = new World({ groundY: null, heightfield: flatField(2) });
    const hits = world.raycast([0, 5, 0], [0, -1, 0]);
    expect(hits).toHaveLength(1);
    expect(hits[0].index).toBe(-1);
    expect(hits[0].distance).toBeCloseTo(3, 4);
    expect(hits[0].point[1]).toBeCloseTo(2, 3);
    expect(hits[0].normal[1]).toBeCloseTo(1, 4);
  });

  it('reports t=0 for an origin below the surface', () => {
    const world = new World({ groundY: null, heightfield: flatField(2) });
    const hits = world.raycast([0, 1, 0], [1, 0, 0]);
    expect(hits).toHaveLength(1);
    expect(hits[0].index).toBe(-1);
    expect(hits[0].distance).toBe(0);
  });

  it('walks columns into the plane h = x and returns the slope normal', () => {
    const world = new World({ groundY: null, heightfield: planeField() });
    const hits = world.raycast([-5, 3, 0], [1, 0, 0]);
    expect(hits).toHaveLength(1);
    expect(hits[0].distance).toBeCloseTo(8, 3);
    expect(hits[0].normal[0]).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(hits[0].normal[1]).toBeCloseTo(Math.SQRT1_2, 3);
    expect(world.raycast([-5, 3, 0], [1, 0, 0], 7.9)).toEqual([]);
  });

  it('misses a ray skimming above flat terrain', () => {
    const world = new World({ groundY: null, heightfield: flatField(2) });
    expect(world.raycast([0, 5, 0], [1, 0, 0])).toEqual([]);
    expect(world.raycast([0, 5, 0], [0, 1, 0])).toEqual([]);
  });

  it('sorts terrain hits among body hits as index -1', () => {
    const world = new World({ groundY: null, heightfield: flatField(2) });
    world.addParticle({ position: [0, 4, 0], radius: 0.5 });
    const hits = world.raycast([0, 10, 0], [0, -1, 0]);
    expect(hits).toHaveLength(2);
    expect(hits[0].index).toBe(0);
    expect(hits[0].distance).toBeCloseTo(5.5, 4);
    expect(hits[1].index).toBe(-1);
    expect(hits[1].distance).toBeCloseTo(8, 4);
  });
});
