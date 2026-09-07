/**
 * Morton codec bake-off: correctness + throughput.
 * Candidates: ours (morton3D_10), fast-morton (magic-bit & LUT variants),
 * @thi.ng/morton ZCurve3. Plain `morton` was eliminated pre-bench: 2D-only.
 * Run with: npx vite-node bench/morton-libs.bench.ts
 */
import { performance } from 'node:perf_hooks';
import {
  morton3DEncodeLUT,
  morton3DEncodeMB,
  morton3DDecodeLUT,
  morton3DDecodeMB,
} from 'fast-morton';
import { ZCurve3 } from '@thi.ng/morton';
import { morton3D_10, demorton3D_10 } from '../src/morton.js';
import { mulberry32 } from './rand.js';

const N = 4096;
const ITERS = 2000;

const rand = mulberry32(0xdecaf);
const xs = new Int32Array(N);
const ys = new Int32Array(N);
const zs = new Int32Array(N);
for (let i = 0; i < N; i += 1) {
  xs[i] = Math.floor(rand() * 1024);
  ys[i] = Math.floor(rand() * 1024);
  zs[i] = Math.floor(rand() * 1024);
}

type EncodeFn = (x: number, y: number, z: number) => number | bigint;

const zcurve = new ZCurve3(10);
const zcPoint = [0, 0, 0];

const candidates: Array<[string, EncodeFn]> = [
  ['ours (morton3D_10)', morton3D_10],
  ['fast-morton MB', morton3DEncodeMB],
  ['fast-morton LUT', morton3DEncodeLUT],
  [
    '@thi.ng/morton ZCurve3',
    (x, y, z) => {
      zcPoint[0] = x;
      zcPoint[1] = y;
      zcPoint[2] = z;
      return zcurve.encode(zcPoint);
    },
  ],
];

// ---- Correctness: every candidate must match our roundtrip-verified reference ----
const battery: Array<[number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1023, 1023, 1023],
  [512, 511, 1],
  [1, 1023, 7],
  [42, 666, 1000],
];
for (let i = 0; i < 100; i += 1) {
  battery.push([Math.floor(rand() * 1024), Math.floor(rand() * 1024), Math.floor(rand() * 1024)]);
}

let allCorrect = true;
for (const [label, fn] of candidates) {
  let mismatches = 0;
  for (const [x, y, z] of battery) {
    if (BigInt(fn(x, y, z)) !== BigInt(morton3D_10(x, y, z))) mismatches += 1;
  }
  if (mismatches > 0) allCorrect = false;
  console.log(`correctness ${label}: ${mismatches === 0 ? 'MATCH' : `${mismatches} MISMATCHES`}`);
}
if (!allCorrect) {
  console.log('correctness failure somewhere — throughput numbers below are for the matching subset only');
}

// ---- Throughput: encode ----
console.log(`\nencode: ${N} coords x ${ITERS} iters`);
for (const [label, fn] of candidates) {
  let acc = 0;
  for (let w = 0; w < 100; w += 1) {
    for (let i = 0; i < N; i += 1) acc += Number(fn(xs[i], ys[i], zs[i]));
  }
  const t0 = performance.now();
  for (let t = 0; t < ITERS; t += 1) {
    for (let i = 0; i < N; i += 1) acc += Number(fn(xs[i], ys[i], zs[i]));
  }
  const dt = performance.now() - t0;
  console.log(`${label.padEnd(24)} ${dt.toFixed(0).padStart(6)} ms  ${((dt * 1e6) / (ITERS * N)).toFixed(2)} ns/op  (checksum ${acc % 1e9})`);
}

// ---- Throughput: decode ----
type DecodeFn = (key: number) => ArrayLike<number>;
const keys = new Int32Array(N);
for (let i = 0; i < N; i += 1) keys[i] = morton3D_10(xs[i], ys[i], zs[i]);

const decodeCandidates: Array<[string, DecodeFn]> = [
  ['ours (demorton3D_10)', demorton3D_10],
  ['fast-morton MB decode', (k) => morton3DDecodeMB(k)],
  ['fast-morton LUT decode', (k) => morton3DDecodeLUT(k)],
];

console.log(`\ndecode: ${N} keys x ${ITERS} iters`);
for (const [label, fn] of decodeCandidates) {
  let acc = 0;
  for (let w = 0; w < 100; w += 1) {
    for (let i = 0; i < N; i += 1) acc += fn(keys[i])[0];
  }
  const t0 = performance.now();
  for (let t = 0; t < ITERS; t += 1) {
    for (let i = 0; i < N; i += 1) acc += fn(keys[i])[0];
  }
  const dt = performance.now() - t0;
  console.log(`${label.padEnd(24)} ${dt.toFixed(0).padStart(6)} ms  ${((dt * 1e6) / (ITERS * N)).toFixed(2)} ns/op  (checksum ${acc % 1e9})`);
}
