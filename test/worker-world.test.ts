/**
 * WorkerWorld protocol tests on a same-thread MessageChannel: the real
 * worker-core handler installed on port2, the facade on port1. Node ships
 * MessageChannel + SharedArrayBuffer globally, so both modes get exercised
 * without a browser. (Real-thread latency numbers live in
 * bench/threaded.bench.ts, not here.)
 */
import { afterEach, describe, expect, it } from 'vitest';

import { install } from '../src/threaded/worker-core.js';
import { WorkerWorld, type WorkerWorldOptions } from '../src/threaded/worker-world.js';
import type { PortLike } from '../src/threaded/ports.js';

const openPorts: MessagePort[] = [];

function makeWorker(): PortLike {
  const { port1, port2 } = new MessageChannel();
  install(port2 as unknown as PortLike, () => port2.close());
  openPorts.push(port1, port2);
  return port1 as unknown as PortLike;
}

function makeWorld(options: WorkerWorldOptions = {}): Promise<WorkerWorld> {
  return WorkerWorld.create({ worker: makeWorker(), ...options });
}

afterEach(() => {
  for (const port of openPorts.splice(0)) port.close();
});

describe('WorkerWorld (shared SAB mode)', () => {
  it('kicks, waits, and moves particles under gravity', async () => {
    const world = await makeWorld({ capacity: 16 });
    expect(world.shared).toBe(true);

    world.addParticles([{ position: [0, 10, 0], radius: 0.5 }]);
    expect(world.count).toBe(1);
    expect(world.radiusOf(0)).toBe(0.5);

    expect(world.kick(1 / 60)).toBe(true);
    const step = await world.waitForUpdate();
    expect(step).toBe(1);
    expect(world.positions[1]).toBeLessThan(10); // gravity did its job
    world.dispose();
  });

  it('coalesces kick() while a step is in flight', async () => {
    const world = await makeWorld();
    world.addParticles([{ position: [0, 10, 0] }]);
    expect(world.kick()).toBe(true);
    // Same-thread worker hasn't run yet: the step is still in flight.
    expect(world.kick()).toBe(false);
    await world.waitForUpdate();
    expect(world.kick()).toBe(true);
    await world.waitForUpdate();
    world.dispose();
  });

  it('settles a dropped ball on the ground plane, not through it', async () => {
    const world = await makeWorld({ restitution: 0.2 });
    world.addParticles([{ position: [0, 3, 0], radius: 0.5 }]);
    for (let i = 0; i < 180; i += 1) await world.stepOnce();
    const y = world.positions[1];
    expect(y).toBeGreaterThan(0.49);
    expect(y).toBeLessThan(0.51);
    world.dispose();
  });

  it('round-trips raycasts through the worker', async () => {
    const world = await makeWorld({ gravity: [0, 0, 0], groundY: null });
    world.addParticles([{ position: [0, 0, 0], radius: 1 }]);
    const hits = await world.raycast([0, 5, 0], [0, -1, 0]);
    expect(hits).toHaveLength(1);
    expect(hits[0].index).toBe(0);
    expect(hits[0].distance).toBeCloseTo(4, 5);
    world.dispose();
  });

  it('runs heightfield terrain passed as a plain spec', async () => {
    const world = await makeWorld({
      groundY: null,
      heightfield: { rows: 2, cols: 2, cellSize: 10, origin: [-5, 0, -5], heights: [2, 2, 2, 2] },
    });
    world.addParticles([{ position: [0, 5, 0], radius: 0.5 }]);
    for (let i = 0; i < 240; i += 1) await world.stepOnce();
    expect(world.positions[1]).toBeCloseTo(2.5, 2);
    const hits = await world.raycast([0, 5, 0], [0, -1, 0]);
    expect(hits).toHaveLength(2);
    expect(hits[0].index).toBe(0); // the (settled) ball still reports
    expect(hits[1].index).toBe(-1); // terrain behind it
    world.dispose();
  });

  it('accepts a Heightfield instance and copies it to the worker', async () => {
    const { Heightfield } = await import('../src/heightfield.js');
    const field = new Heightfield({
      rows: 2,
      cols: 2,
      cellSize: 10,
      origin: [-5, 0, -5],
      heights: [3, 3, 3, 3],
    });
    const world = await makeWorld({ groundY: null, heightfield: field });
    world.addParticles([{ position: [0, 6, 0], radius: 0.5 }]);
    for (let i = 0; i < 240; i += 1) await world.stepOnce();
    expect(world.positions[1]).toBeCloseTo(3.5, 2);
    // Later edits to the caller's instance do not propagate; the worker owns its copy.
    field.setHeight(0, 0, -10);
    await world.stepOnce();
    expect(world.positions[1]).toBeCloseTo(3.5, 2);
    world.dispose();
  });

  it('rejects immediately when capacity would be exceeded', async () => {
    const world = await makeWorld({ capacity: 2 });
    world.addParticles([{ position: [0, 1, 0] }, { position: [1, 1, 0] }]);
    expect(() => world.addParticles([{ position: [2, 1, 0] }])).toThrow(/capacity exceeded/i);
    world.dispose();
  });

  it('matches the sync World step-for-step (worker is not a second engine)', async () => {
    const specs = Array.from({ length: 32 }, (_, i) => ({
      position: [((i * 7) % 5) - 2, 5 + i * 0.5, ((i * 13) % 5) - 2] as [number, number, number],
      velocity: [0.1 * (i % 3), 0, 0] as [number, number, number],
      radius: 0.3 + (i % 4) * 0.1,
    }));

    const { World } = await import('../src/world.js');
    const sync = new World({ restitution: 0.4 });
    const threaded = await makeWorld({ restitution: 0.4, capacity: 64 });
    specs.forEach((s) => sync.addParticle(s));
    threaded.addParticles(specs);

    for (let i = 0; i < 60; i += 1) {
      sync.step(1 / 60);
      await threaded.stepOnce(1 / 60);
    }
    for (let i = 0; i < sync.count * 3; i += 1) {
      expect(threaded.positions[i]).toBeCloseTo(sync.positions[i], 6);
    }
    threaded.dispose();
  });
});

describe('WorkerWorld (copy fallback mode)', () => {
  it('steps and delivers position copies without SAB', async () => {
    const world = await makeWorld({ capacity: 16, forceCopyMode: true });
    expect(world.shared).toBe(false);

    world.addParticles([{ position: [0, 10, 0] }]);
    expect(world.positions.length).toBe(0); // nothing stepped yet
    await world.stepOnce();
    expect(world.positions.length).toBe(3);
    expect(world.positions[1]).toBeLessThan(10);
    world.dispose();
  });
});
