# Flit

Flit is a tiny little physics engine for 3js. It doesn't do much yet! but I believe!

Spheres, gravity, and a spatial-hash broadphase — nothing more, on purpose.
All simulation state lives in flat `Float32Array`s (structure-of-arrays), so
the CPU path doubles as the reference implementation for a future WebGPU
compute backend: same buffers, same kernels, no re-architecting.

## What's in the box

- **`World`** — point-sphere particles, semi-implicit Euler integration,
  impulse + positional-correction contact solver, infinite ground plane.
- **`SpatialHash`** — uniform grid broadphase (Teschner-style xor hash).
  This is the Euclidean cousin in the LSH family: MinHash buckets documents
  by Jaccard similarity; this buckets positions so *nearby points collide
  in the same bucket*.
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
```

## Roadmap

- Morton-ordered broadphase cells (the pieces are already in `src/morton.ts`)
- three.js demo scene
- WebGPU compute backend once the CPU reference settles

## License

MIT — see `LICENSE`. Third-party portions and their licenses are listed in
`THIRD_PARTY_NOTICES.md`.
