/**
 * Broadphase micro-benchmark: clear + insert + queryPairs over N points.
 * Run with: npx vite-node bench/broadphase.bench.ts
 *
 * Deterministic (mulberry32, fixed seed) so before/after implementations
 * can be compared on the same point set.
 */
import { performance } from 'node:perf_hooks';
import { SpatialHash } from '../src/index.js';
import { mulberry32 } from './rand.js';

const N = 4096;
const BOX = 100; // points uniform in [-BOX/2, +BOX/2]^3
const CELL = 1;
const WARMUP = 5;
const ITERS = 30;

const rand = mulberry32(0x5eed);
const points = new Float32Array(N * 3);
for (let i = 0; i < N * 3; i += 1) {
  points[i] = (rand() - 0.5) * BOX;
}

const hash = new SpatialHash(CELL);

const runOnce = (): number => {
  hash.clear();
  for (let i = 0; i < N; i += 1) {
    hash.insert(i, points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
  }
  let pairs = 0;
  hash.queryPairs(() => {
    pairs += 1;
  });
  return pairs;
};

for (let w = 0; w < WARMUP; w += 1) runOnce();

let expectedPairs = -1;
const samples: number[] = [];
for (let t = 0; t < ITERS; t += 1) {
  const start = performance.now();
  const pairs = runOnce();
  samples.push(performance.now() - start);
  if (expectedPairs < 0) expectedPairs = pairs;
  if (pairs !== expectedPairs) {
    throw new Error(`nondeterministic pair count: ${pairs} vs ${expectedPairs}`);
  }
}

samples.sort((a, b) => a - b);
const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
console.log(
  `N=${N} pairs=${expectedPairs} | mean ${mean.toFixed(3)} ms | ` +
    `p50 ${samples[Math.floor(samples.length / 2)].toFixed(3)} ms | ` +
    `min ${samples[0].toFixed(3)} ms`,
);
