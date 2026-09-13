/**
 * Threaded-stepping benchmark: sync World.step vs WorkerWorld over a REAL
 * node:worker_threads Worker with SharedArrayBuffer ping-pong. Feeds the
 * commit message (AGENTS.md rule 1: numbers or it didn't happen).
 * Run with: npx vite-node bench/threaded.bench.ts
 */
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';

import { buildSync } from 'esbuild';

import { World } from '../src/index.js';
import type { PortLike } from '../src/threaded/ports.js';
import { WorkerWorld } from '../src/threaded/worker-world.js';
import { mulberry32 } from './rand.js';

const DT = 1 / 60;
const WARMUP = 30;
const STEPS = 100;
const FAKE_RENDER_MS = 4;

function makeSpecs(n: number, seed: number) {
  const rand = mulberry32(seed);
  return Array.from({ length: n }, () => ({
    position: [
      (rand() - 0.5) * 30,
      (rand() - 0.5) * 30,
      (rand() - 0.5) * 30,
    ] as [number, number, number],
    velocity: [
      (rand() - 0.5) * 2,
      (rand() - 0.5) * 2,
      (rand() - 0.5) * 2,
    ] as [number, number, number],
    radius: 0.5,
  }));
}

/** Stand-in for renderer.render(scene, camera): busy main-thread work. */
function spin(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* pretend to draw triangles */
  }
}

// worker_threads can't load TS: bundle the entry to one CJS string and eval.
// (gl-matrix gets inlined; only node builtins stay external.)
const workerCode = buildSync({
  entryPoints: ['src/threaded/worker.node.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['node:worker_threads'],
}).outputFiles[0].text;

async function run(n: number): Promise<void> {
  const specs = makeSpecs(n, 0xc0ffee);
  const options = {
    gravity: [0, 0, 0] as [number, number, number],
    groundY: null,
    restitution: 0.5,
  };

  // --- sync baseline, same conditions as bench/world.bench.ts ---
  const sync = new World({ ...options, capacity: n });
  specs.forEach((s) => sync.addParticle(s));
  for (let i = 0; i < WARMUP; i += 1) sync.step(DT);
  let t0 = performance.now();
  for (let i = 0; i < STEPS; i += 1) sync.step(DT);
  const syncMs = (performance.now() - t0) / STEPS;

  // --- threaded ---
  const worker = new Worker(workerCode, { eval: true });
  const world = await WorkerWorld.create({
    worker: worker as unknown as PortLike,
    ...options,
    capacity: n,
  });
  world.addParticles(specs);
  for (let i = 0; i < WARMUP; i += 1) await world.stepOnce(DT);

  // Roundtrip: kick + wait, serialized — the worst case for IPC overhead.
  t0 = performance.now();
  for (let i = 0; i < STEPS; i += 1) await world.stepOnce(DT);
  const roundtripMs = (performance.now() - t0) / STEPS;

  // kick() alone: what the game thread pays to START a step.
  let kickTotal = 0;
  for (let i = 0; i < STEPS; i += 1) {
    const k0 = performance.now();
    world.kick(DT);
    kickTotal += performance.now() - k0;
    await world.waitForUpdate();
  }
  const kickMs = kickTotal / STEPS;

  // Pipelined frame: "render" (4 ms busy work) while the worker steps.
  t0 = performance.now();
  for (let i = 0; i < STEPS; i += 1) {
    world.kick(DT);
    spin(FAKE_RENDER_MS);
    await world.waitForUpdate();
  }
  const pipelinedMs = (performance.now() - t0) / STEPS;
  const serialMs = syncMs + FAKE_RENDER_MS; // game-thread sim + same render

  const overheadPct = ((roundtripMs - syncMs) / syncMs) * 100;
  console.log(
    `N=${n} | sync ${syncMs.toFixed(3)} ms/step | ` +
      `worker roundtrip ${roundtripMs.toFixed(3)} (${overheadPct >= 0 ? '+' : ''}${overheadPct.toFixed(0)}% vs sync) | ` +
      `kick() ${kickMs.toFixed(4)} ms on main thread | ` +
      `frame with ${FAKE_RENDER_MS} ms render: pipelined ${pipelinedMs.toFixed(3)} ms vs serial ${serialMs.toFixed(3)} ms`,
  );

  world.dispose();
  await worker.terminate();
}

await run(1024);
await run(8192);
