/**
 * Full-step benchmark: N drifting spheres, World.step() end to end.
 * This is the number that actually matters — broadphase cost AND the
 * narrowphase work implied by its candidate-pair quality.
 * Run with: npx vite-node bench/world.bench.ts
 */
import { performance } from 'node:perf_hooks';
import { World } from '../src/index.js';
import { mulberry32 } from './rand.js';

const N = 1024;
const BOX = 30;
const WARMUP_STEPS = 10;
const MEASURED_STEPS = 100;
const DT = 1 / 60;

const rand = mulberry32(0xc0ffee);
const world = new World({ gravity: [0, 0, 0], groundY: null, restitution: 0.5 });
for (let i = 0; i < N; i += 1) {
  world.addParticle({
    position: [(rand() - 0.5) * BOX, (rand() - 0.5) * BOX, (rand() - 0.5) * BOX],
    velocity: [(rand() - 0.5) * 2, (rand() - 0.5) * 2, (rand() - 0.5) * 2],
    radius: 0.5,
  });
}

for (let s = 0; s < WARMUP_STEPS; s += 1) world.step(DT);

const start = performance.now();
for (let s = 0; s < MEASURED_STEPS; s += 1) world.step(DT);
const total = performance.now() - start;

console.log(
  `N=${N} steps=${MEASURED_STEPS} | total ${total.toFixed(1)} ms | ` +
    `${(total / MEASURED_STEPS).toFixed(3)} ms/step`,
);
