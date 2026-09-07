/**
 * Scaling sweep: same box (demo-like 18x12x18), rising N, uniform radius.
 * One variable at a time: density is the variable, cell size is not
 * (uniform radius => World's auto cellSize is constant across the sweep).
 *
 * Per N, reports: full World.step cost, broadphase-only cost on the same
 * positions (clear+insert+queryPairs via SpatialHash directly), and the
 * candidate-pair count. The narrowphase share is roughly step - broadphase.
 *
 * Budgets: 16.67 ms = 60 fps, 8.33 ms = 120 fps.
 * Run with: npx vite-node bench/scaling.bench.ts
 */
import { performance } from 'node:perf_hooks';
import { SpatialHash, World } from '../src/index.js';
import { mulberry32 } from './rand.js';

const RADIUS = 0.35;
const CELL = RADIUS * 2; // matches World's auto cellSize for uniform radius
const DT = 1 / 60;
const WARMUP_STEPS = 30;
const MEASURED_STEPS = 60;
const BOUNDS = { min: [-9, 0, -9] as [number, number, number], max: [9, 12, 9] as [number, number, number] };

function buildWorld(n: number, seed: number): World {
  const rand = mulberry32(seed);
  const world = new World({ restitution: 0.62, groundY: 0, bounds: BOUNDS });
  for (let i = 0; i < n; i += 1) {
    world.addParticle({
      position: [(rand() - 0.5) * 16, 1 + rand() * 10, (rand() - 0.5) * 16],
      velocity: [(rand() - 0.5) * 6, rand() * 2, (rand() - 0.5) * 6],
      radius: RADIUS,
    });
  }
  return world;
}

function broadphaseOnly(world: World): { ms: number; pairs: number } {
  const hash = new SpatialHash(CELL);
  const t0 = performance.now();
  for (let i = 0; i < world.count; i += 1) {
    hash.insert(i, world.positions[i * 3], world.positions[i * 3 + 1], world.positions[i * 3 + 2]);
  }
  let pairs = 0;
  hash.queryPairs(() => {
    pairs += 1;
  });
  return { ms: performance.now() - t0, pairs };
}

console.log('N      | step ms | broadphase ms | pairs  | 60fps?');
console.log('-------+---------+---------------+--------+-------');
for (const n of [250, 500, 1000, 2000, 4000, 8000]) {
  const world = buildWorld(n, 0x10ad);
  for (let s = 0; s < WARMUP_STEPS; s += 1) world.step(DT); // settle spawn overlaps + JIT

  const t0 = performance.now();
  for (let s = 0; s < MEASURED_STEPS; s += 1) world.step(DT);
  const stepMs = (performance.now() - t0) / MEASURED_STEPS;

  const bp = broadphaseOnly(world);
  console.log(
    `${String(n).padEnd(6)} | ${stepMs.toFixed(3).padStart(7)} | ${bp.ms.toFixed(3).padStart(13)} | ${String(bp.pairs).padStart(6)} | ${stepMs < 16.67 ? 'yes' : 'NO'}`,
  );
}
