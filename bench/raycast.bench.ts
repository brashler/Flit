/**
 * Raycast benchmark: K seeded rays through a scattered field of N spheres.
 * Exercises the Amanatides-Woo voxel walk end to end (candidate gather +
 * raySphere + sort). Deterministic; reports per-ray cost and total hits so
 * candidate-set changes (e.g. the 3x3x3 bulge block) show up in both.
 * Run with: npx vite-node bench/raycast.bench.ts
 */
import { performance } from 'node:perf_hooks';
import { World } from '../src/index.js';
import { mulberry32 } from './rand.js';

const N = 4096;
const BOX = 40;
const RAYS = 2000;

const rand = mulberry32(0xba11);
const world = new World({ gravity: [0, 0, 0], groundY: null });
for (let i = 0; i < N; i += 1) {
  world.addParticle({
    position: [(rand() - 0.5) * BOX, (rand() - 0.5) * BOX, (rand() - 0.5) * BOX],
    radius: 0.5,
  });
}
world.syncBroadphase();

const rays: Array<{ o: [number, number, number]; d: [number, number, number] }> = [];
for (let k = 0; k < RAYS; k += 1) {
  const d: [number, number, number] = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
  rays.push({
    o: [(rand() - 0.5) * BOX, (rand() - 0.5) * BOX, (rand() - 0.5) * BOX],
    d,
  });
}

// Finite reach: real callers (picking, LOS) bound the walk; an unbounded
// miss walks to the engine's 4096-cell guard and dominates the measurement.
const MAX_DISTANCE = 70; // ~the 40^3 box diagonal

let hits = 0;
const t0 = performance.now();
for (const { o, d } of rays) {
  hits += world.raycast(o, d, MAX_DISTANCE).length;
}
const total = performance.now() - t0;

console.log(
  `N=${N} rays=${RAYS} hits=${hits} | total ${total.toFixed(1)} ms | ` +
    `${((total / RAYS) * 1000).toFixed(1)} us/ray`,
);
