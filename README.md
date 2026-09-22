# Flit

Flit is a tiny little physics engine for 3js. It doesn't do much yet! but I believe!

Spheres, collisions, raycasts, gravity, and a spatial-hash broadphase — nothing more, on purpose.
All simulation state lives in flat `Float32Array`s (structure-of-arrays), so
the CPU path doubles as the reference implementation for a future WebGPU
compute backend: same buffers, same kernels, no re-architecting.

## What's in the box

- **`World`** — point-sphere particles, semi-implicit Euler integration,
  impulse + positional-correction contact solver, infinite ground plane.
  Bodies that stay quiet SETTLE (per-body sleep driven by a stiction
  threshold), so resting piles cost ~nothing; a fast-enough impact wakes
  them, a slow push is held by static friction.
- **`Heightfield`** — 2.5D terrain as a grid of height posts, no meshing:
  bilinear height + central-difference normals sampled directly for
  collision, and a 2D Amanatides-Woo DDA for raycasts (`index: -1`).
- **Raycast** — Amanatides-Woo voxel walk over the broadphase grid;
  candidates from the 3x3x3 block around the walked path so corner
  clips are never missed. Differential-tested against a brute-force
  oracle.
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

## For agents

Building a little three.js game or demo? Two ways in:

- **Skill**: `skills/flit/SKILL.md` — copy the `skills/flit/` directory into
  your agent's skills path (e.g. `.claude/skills/`, `~/.code_puppy/skills/`).
  It carries the 30-second integration recipe, the MCP option, measured
  performance envelope, and contributor rules.
- **MCP server** (no code needed): `npm run mcp`, or point your client at it:

```json
{
  "mcpServers": {
    "flit": {
      "command": "npx",
      "args": ["vite-node", "mcp/server.ts"],
      "cwd": "<path-to-this-repo>"
    }
  }
}
```

Tools: `flit_info`, `flit_reset` (gravity/restitution/ground/bounds/
settleSpeed/heightfield), `flit_spawn` (rain/explosion/grid/fountain
presets), `flit_add_particles`, `flit_step`, `flit_state`, `flit_raycast`
— step/state return flat xyz positions shaped for `InstancedMesh` syncing
plus `settledCount`, so you can watch a pile go quiet.

## Usage

```bash
npm i flit-physics
```

```ts
import { World } from 'flit-physics';

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

Terrain and sleep are one option each:

```ts
import { Heightfield, World } from 'flit-physics';

const terrain = new Heightfield({ rows: 64, cols: 64, cellSize: 1, heights });
const world = new World({ groundY: null, heightfield: terrain });
// bodies collide with the terrain and settle on it;
// world.raycast(...) reports terrain hits as index -1

// sleep is on by default (settleSpeed 0.01 m/s); opt out per world:
const wideAwake = new World({ settleSpeed: 0 });
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
time (see commit messages for the full series, including rejected designs).

- `bench/broadphase.bench.ts` — broadphase only, N=4096:
  xor-hash 3.4–3.7 ms (444 pairs, ~90% collision bloat) → Morton keys
  with ordered probing **3.5–3.7 ms (234 pairs, exact)**.
- `bench/world.bench.ts` — full `World.step`, N=1024:
  xor-hash 0.85 ms/step → Morton ordered-probing 0.83 ms/step →
  **0.93 ms/step** with the sequential-impulse velocity solver
  (4 iterations + LUT friction). Exact keys, real contacts, +11%.
- `bench/scaling.bench.ts` — two regimes. Fixed box (density rises):
  pairs scale ~N² from crowding physics. Scaled box (constant *spawn*
  density): flat O(N) ≈ 1.2 ms per 1000 through N=8000 while bodies are
  scattered. With gravity on, everything rains into a dense floor pile
  over ~2-4s (`WARMUP=240` to reproduce) — and since 0.3.0 the pile
  SETTLES: **34.2 → 9.2 ms/step at N=8000** (3.7x, inside the 60fps
  budget) as bodies fall asleep bottom-up. Settled bodies are skipped
  by integration, planes, and mutual contacts until a >1 m/s impact
  wakes them. (`docs/issues/001` — resolved; brief kept for the
  analysis and the remaining ideas: warm starting, adaptive iterations.)
- `bench/raycast.bench.ts` — 2000 seeded rays at N=4096:
  **63–68 µs/ray** (vs ~160 µs for a brute-force O(N) oracle at the
  same density; the grid walk pulls further ahead as N grows).
- `bench/morton-libs.bench.ts` — codec bake-off vs npm libs
  (`npm run bench:libs`): ours 3.8 ns/encode, fast-morton MB 26.1,
  fast-morton LUT 43.8, @thi.ng/morton 539.9. In-house wins; the libs
  stay as devDependencies purely so the bake-off stays runnable.
- `bench/threaded.bench.ts` — WorkerWorld over a real worker thread
  (SAB ping-pong): `kick()` costs **0.014 ms** on the main thread; with a
  4 ms render workload a frame costs **8.84 ms pipelined vs 14.96 ms
  serial** at N=8192 (113 fps vs 67). At N=1024 the 0.8 ms step hides
  entirely behind render (4.03 vs 4.80 ms).
- Rejected on measurement (see commits): 63-bit BigInt keys (13× alloc
  regression); sorted-array + binary-search broadphase (1.4× slower
  than Map probing in JS — negative result recorded).

## Roadmap

- ~~Morton-ordered broadphase cells~~ — done, measured, shipped
- ~~three.js demo scene~~ — `npm run demo`, 220 balls in a box
- ~~Worker-threaded stepping~~ — `WorkerWorld`: kick/waitForUpdate, SAB
  ping-pong zero-copy rendering
- ~~Settled-pile solver cost~~ — per-body sleep shipped (34.2 → 9.2 ms
  at N=8000); [issue brief](docs/issues/001-settled-pile-performance.md)
  kept for the remaining ideas (warm starting, adaptive iterations)
- ~~Heightfield terrain~~ — shipped, no meshing; hooks left for more
  collider shapes
- Raycast coarse occupancy filter (skip empty space faster) if
  ray-heavy workloads show up — see commit `3173a6f` for the analysis
- WebGPU compute backend once the CPU reference settles

## License

MIT — see `LICENSE`. Third-party portions and their licenses are listed in
`THIRD_PARTY_NOTICES.md`.
