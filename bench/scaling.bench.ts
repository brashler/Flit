/**
 * Scaling sweep, two regimes:
 *
 *  A) FIXED BOX (density rises with N) — models "how many balls fit in the
 *     demo box". Pair count grows ~quadratically: that is the physics of
 *     crowding, not an algorithmic defect.
 *  B) SCALED BOX (constant spawn density, box volume proportional to N) —
 *     models algorithmic scaling. A correct grid broadphase is O(N) here;
 *     pairs per ball stay ~constant — WHILE bodies are scattered. Note:
 *     with gravity on, bodies rain into a dense floor pile over ~2-4s and
 *     the steady state becomes contact-solver dominated. Set WARMUP=240
 *     (env) to measure the settled-pile state instead of the scatter state.
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
const WARMUP_STEPS = Number(process.env.WARMUP ?? 30);
const MEASURED_STEPS = 60;

interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

function buildWorld(n: number, seed: number, box: Box): World {
  const rand = mulberry32(seed);
  const world = new World({ restitution: 0.62, groundY: 0, bounds: box });
  const sx = box.max[0] - box.min[0] - 2;
  const sy = box.max[1] - box.min[1] - 2;
  const sz = box.max[2] - box.min[2] - 2;
  for (let i = 0; i < n; i += 1) {
    world.addParticle({
      position: [(rand() - 0.5) * sx, 1 + rand() * sy, (rand() - 0.5) * sz],
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

function sweep(label: string, boxFor: (n: number) => Box): void {
  console.log(`\n${label}`);
  console.log('N      | step ms | ms/1000 | broadphase ms | pairs | pairs/ball');
  console.log('-------+---------+---------+---------------+-------+-----------');
  for (const n of [250, 500, 1000, 2000, 4000, 8000]) {
    const world = buildWorld(n, 0x10ad, boxFor(n));
    for (let s = 0; s < WARMUP_STEPS; s += 1) world.step(DT);

    const t0 = performance.now();
    for (let s = 0; s < MEASURED_STEPS; s += 1) world.step(DT);
    const stepMs = (performance.now() - t0) / MEASURED_STEPS;

    const bp = broadphaseOnly(world);
    console.log(
      `${String(n).padEnd(6)} | ${stepMs.toFixed(3).padStart(7)} | ${(stepMs / (n / 1000)).toFixed(3).padStart(7)} | ${bp.ms.toFixed(3).padStart(13)} | ${String(bp.pairs).padStart(6)}| ${(bp.pairs / n).toFixed(2)}`,
    );
  }
}

const DEMO_BOX: Box = { min: [-9, 0, -9], max: [9, 12, 9] };
const DEMO_VOLUME = 18 * 12 * 18;

// A) fixed demo box: density rises with N
sweep('A) fixed box (density rises) — expect pairs ~N^2 from crowding physics', () => DEMO_BOX);

// B) box scaled so volume per ball matches the N=1000 fixed-box case
sweep('B) scaled box (constant density) — expect ~O(N): flat pairs/ball, flat ms/1000', (n) => {
  const scale = Math.cbrt(n / 1000);
  return {
    min: [(-18 * scale) / 2, 0, (-18 * scale) / 2],
    max: [(18 * scale) / 2, 12 * scale, (18 * scale) / 2],
  };
});
