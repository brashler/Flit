# Flit

Flit is a tiny little physics engine for 3js. It doesn't do much yet! but I believe!

Spheres, gravity, and a spatial-hash broadphase — nothing more, on purpose.
All simulation state lives in flat `Float32Array`s (structure-of-arrays), so
the CPU path doubles as the reference implementation for a future WebGPU
compute backend: same buffers, same kernels, no re-architecting.

## What's in the box

- **`World`** — point-sphere particles, semi-implicit Euler integration,
  impulse + positional-correction contact solver, infinite ground plane.
- **`SpatialHash`** — uniform grid broadphase keyed by Morton (Z-order)
  cell codes. This is the Euclidean cousin in the LSH family: MinHash
  buckets documents by Jaccard similarity; this buckets positions so
  *nearby points collide in the same bucket*. Morton keys are bijective
  (no hash-collision pair bloat), invertible (no side table), and
  locality-ordered for a future sorted-array GPU backend.
- **Distance & bit utilities** — squared Euclidean/L1/Minkowski/L∞/Hellinger/
  chi-square/KL distances (ported from FLANN), Morton (Z-order) keys,
  float bit-flips for radix sorting, octagonal approximate distance.
  See `THIRD_PARTY_NOTICES.md` for provenance and licenses.

## Usage

```ts
import { World } from 'flit';

const world = new World({ restitution: 0.4 }); // gravity and a floor at y=0 included

const ball = world.addParticle({ position: [0, 10, 0], radius: 0.5, mass: 1 });

// fixed timestep, e.g. from your rAF loop
world.step(1 / 60);

// sync to three.js: positions is a live Float32Array, 3 floats per particle
mesh.position.set(
  world.positions[ball * 3],
  world.positions[ball * 3 + 1],
  world.positions[ball * 3 + 2],
);
```

## Develop

```bash
npm install
npm test        # vitest
npm run build   # tsc -> dist/
npm run bench   # broadphase + full-step micro-benchmarks
npm run demo    # three.js demo scene (vite dev server)
```

## Benchmarks

Deterministic seeds; numbers from a local dev machine, recorded at commit
time (see commit messages for the full series).

- `bench/broadphase.bench.ts` — broadphase only, N=4096:
  xor-hash 3.4–3.7 ms (444 pairs, ~90% collision bloat) → Morton keys
  4.4–4.6 ms (**234 pairs, exact**). BigInt-key attempt measured
  43–50 ms and was rejected.
- `bench/world.bench.ts` — full `World.step`, N=1024: 1.17 ms/step
  (vs 0.85 ms/step for xor — the price of exact, invertible,
  GPU-ordered keys).
- `bench/morton-libs.bench.ts` — codec bake-off vs npm libs
  (`npm run bench:libs`): ours 3.8 ns/encode, fast-morton MB 26.1,
  fast-morton LUT 43.8, @thi.ng/morton 539.9. In-house wins; the libs
  stay as devDependencies purely so the bake-off stays runnable.

## Roadmap

- ~~Morton-ordered broadphase cells~~ — done, measured, shipped
- ~~three.js demo scene~~ — `npm run demo`, 220 balls in a box
- WebGPU compute backend once the CPU reference settles

## License

MIT — see `LICENSE`. Third-party portions and their licenses are listed in
`THIRD_PARTY_NOTICES.md`.
