/**
 * Settling (per-body sleep driven by the stiction threshold). The three
 * gates named by docs/issues/001 — "dropped ball wakes a sleeping body",
 * "sleeping pile neither sinks nor creeps over 600 steps", "raycast
 * against sleeping bodies still hits" — plus threshold semantics:
 * settles at rest, never mid-air, 0 disables, plane micro-bounce dies.
 */
import { describe, expect, it } from 'vitest';

import { World } from '../src/world.js';

const DT = 1 / 60;

function speedOf(world: World, i: number): number {
  return Math.hypot(
    world.velocities[i * 3],
    world.velocities[i * 3 + 1],
    world.velocities[i * 3 + 2],
  );
}

describe('settling (stiction + per-body sleep)', () => {
  it('a dropped ball comes to rest exactly and settles', () => {
    const world = new World({ restitution: 0.4 });
    world.addParticle({ position: [0, 1, 0], radius: 0.5 });
    for (let s = 0; s < 120; s += 1) world.step(DT);

    expect(world.isSettled(0)).toBe(true);
    expect(world.settledCount).toBe(1);
    expect(speedOf(world, 0)).toBe(0);
    // Ground contact resolves penetration fully, so rest is exactly touching.
    expect(world.positions[1]).toBeGreaterThan(0.49);
    expect(world.positions[1]).toBeLessThanOrEqual(0.5);
  });

  it('a settled stack neither sinks nor creeps over 600 steps', () => {
    const world = new World({ restitution: 0.2 });
    world.addParticle({ position: [0, 0.5, 0], radius: 0.5 });
    world.addParticle({ position: [0, 1.5, 0], radius: 0.5 });
    for (let s = 0; s < 120; s += 1) world.step(DT);
    expect(world.settledCount).toBe(2);

    const snapshot = Array.from(world.positions.subarray(0, 6));
    for (let s = 0; s < 600; s += 1) world.step(DT);
    for (let k = 0; k < 6; k += 1) {
      expect(world.positions[k]).toBe(snapshot[k]); // bit-identical: skipped, not damped
    }
    expect(world.settledCount).toBe(2);
  });

  it('a dropped ball wakes the settled body it lands on (and the pile re-quiets)', () => {
    const world = new World({ restitution: 0.2 });
    world.addParticle({ position: [0, 0.5, 0], radius: 0.5 });
    for (let s = 0; s < 120; s += 1) world.step(DT);
    expect(world.isSettled(0)).toBe(true);

    world.addParticle({ position: [0.1, 3, 0], radius: 0.5 }); // falls onto ball 0
    let woke = false;
    for (let s = 0; s < 120 && !woke; s += 1) {
      world.step(DT);
      woke = !world.isSettled(0);
    }
    expect(woke).toBe(true);

    // The point of the stiction floor: the disturbed pile re-quiets fast.
    for (let s = 0; s < 180; s += 1) world.step(DT);
    expect(world.settledCount).toBe(2);
  });

  it('raycast still hits settled bodies', () => {
    const world = new World({ restitution: 0.2 });
    world.addParticle({ position: [0, 0.5, 0], radius: 0.5 });
    for (let s = 0; s < 120; s += 1) world.step(DT);
    expect(world.isSettled(0)).toBe(true);

    const hits = world.raycast([0, 5, 0], [0, -1, 0]);
    expect(hits).toHaveLength(1);
    expect(hits[0].index).toBe(0);
  });

  it('never settles mid-air (apex of a toss is brief, not stillness)', () => {
    const world = new World({ restitution: 0.4 });
    world.addParticle({ position: [0, 2, 0], velocity: [0, 2, 0], radius: 0.5 });
    let settledInFlight = false;
    for (let s = 0; s < 15; s += 1) {
      world.step(DT);
      settledInFlight ||= world.isSettled(0);
    }
    expect(settledInFlight).toBe(false);
  });

  it('settleSpeed: 0 disables settling (stiction off)', () => {
    const world = new World({ restitution: 0.2, settleSpeed: 0 });
    world.addParticle({ position: [0, 1, 0], radius: 0.5 });
    for (let s = 0; s < 120; s += 1) world.step(DT);
    expect(world.isSettled(0)).toBe(false);
    expect(world.settledCount).toBe(0);
  });

  it('kills the plane micro-bounce: a near-elastic ball still stops dead', () => {
    const world = new World({ restitution: 0.95 });
    world.addParticle({ position: [0, 0.7, 0], radius: 0.5 }); // ~20 cm drop
    for (let s = 0; s < 180; s += 1) world.step(DT);
    expect(speedOf(world, 0)).toBe(0);
    expect(world.isSettled(0)).toBe(true);
  });

  it('a four-ball stack quiets bottom-up and fully settles', () => {
    const world = new World({ restitution: 0.2 });
    for (let k = 0; k < 4; k += 1) {
      world.addParticle({ position: [0, 0.5 + k, 0], radius: 0.5 });
    }
    for (let s = 0; s < 240; s += 1) world.step(DT);
    expect(world.settledCount).toBe(4);
    for (let k = 0; k < 4; k += 1) {
      expect(speedOf(world, k)).toBe(0);
    }
    expect(world.positions[1]).toBeGreaterThan(0.49);
  });

  it('a slow push (<1 m/s) does not wake a settled body: static friction holds', () => {
    // friction 0 so the pusher actually glides to contact (default ground
    // friction stops a 0.9 m/s ball within ~5 cm -- see dampTangential).
    const world = new World({ restitution: 0.2, friction: 0 });
    world.addParticle({ position: [0, 0.5, 0], radius: 0.5 });
    for (let s = 0; s < 120; s += 1) world.step(DT);
    expect(world.isSettled(0)).toBe(true);

    world.addParticle({ position: [1.5, 0.5, 0], radius: 0.5, velocity: [-0.9, 0, 0] });
    let woke = false;
    let minDist = Infinity;
    for (let s = 0; s < 300; s += 1) {
      world.step(DT);
      woke ||= !world.isSettled(0);
      const dx = world.positions[3] - world.positions[0];
      minDist = Math.min(minDist, Math.abs(dx));
    }
    expect(minDist).toBeLessThanOrEqual(1.001); // the push really arrived
    expect(woke).toBe(false); // sub-restitution impact: static friction held
  });

  it('never settles in zero gravity (no supported contact to quiet against)', () => {
    const world = new World({ gravity: [0, 0, 0], groundY: null, restitution: 0.2 });
    world.addParticle({ position: [0, 0, 0], radius: 0.5, velocity: [0.05, 0, 0] });
    world.addParticle({ position: [1, 0, 0], radius: 0.5 });
    for (let s = 0; s < 120; s += 1) world.step(DT);
    expect(world.settledCount).toBe(0);
    expect(speedOf(world, 0) + speedOf(world, 1)).toBeGreaterThan(0);
  });

  it('settle state survives capacity growth', () => {
    const world = new World({ restitution: 0.2, capacity: 2 });
    for (let i = 0; i < 3; i += 1) {
      world.addParticle({ position: [i * 1.5, 0.5, 0], radius: 0.5 });
    }
    for (let s = 0; s < 120; s += 1) world.step(DT);
    expect(world.settledCount).toBe(3);
  });
});
