# Changelog

All notable changes to Flit. Semver-ish while 0.x: minor = new features,
patch = fixes.

## [0.3.0] — 2026-09-22

### Added

- **Velocity thresholding + per-body settling (sleep)** —
  `WorldOptions.settleSpeed` (default 0.01 m/s; 0 disables). Awake bodies
  slower than the threshold get their velocity zeroed outright (the
  static-friction floor); a body staying quiet for ~0.5 s SETTLES —
  treated as static until a contact partner moving >1 m/s (the
  restitution threshold) wakes it, so slower pushes are held by static
  friction. A supported-stationary qualifier (gravity-aligned resting
  contact + speed steady within a band) lets piles quiet bottom-up
  despite the solver's per-link jitter floor (~1 g*dt per awake link,
  measured). Sub-restitution plane impacts now stop dead instead of
  micro-bouncing ~16 cm/s every step. Observability: `world.isSettled(i)`,
  `world.settledCount`.
- **Heightfield terrain** (`Heightfield`, `WorldOptions.heightfield`) —
  a 2.5D grid of height posts with NO meshing: bilinear height and
  central-difference normals are pure functions of (x, z). Collision
  mirrors the ground plane (positional push, restitution cutoff, LUT
  friction), so bodies settle on terrain. `world.raycast` reports terrain
  hits as `index: -1`, sorted among body hits.
- `bench/raycast.bench.ts` — deterministic raycast harness (N=4096,
  2000 seeded rays).
- MCP server 0.2.0: `flit_reset` accepts `settleSpeed` and a `heightfield`
  spec; `flit_info` reports settle config + terrain summary;
  `flit_step`/`flit_state` report `settledCount` (watch a pile go quiet).
- `WorkerWorldOptions.heightfield` — terrain crosses the worker boundary
  as a plain spec (or an instance, converted main-side); the worker owns
  its copy.
- **`WorkerWorld`** (`src/threaded/`) — the engine steps on a background
  thread. `kick(dt)` starts a step and returns in ~0.014 ms;
  `waitForUpdate()` resolves when it lands (`stepOnce()` = both).
  Rendering reads `positions`, a tear-free ping-pong view into two
  SharedArrayBuffers (zero-copy), with a structured-clone fallback when
  SAB is unavailable (page not cross-origin isolated). Radii are mirrored
  main-side from spawn specs; raycasts round-trip through the worker.
  Fixed capacity (no growth) in threaded mode. `World` is untouched and
  stays the sync reference — the worker is a wrapper, not a fork.
  - Browser: default worker bundled via `new URL(..., import.meta.url)`.
  - Node: pass a `node:worker_threads` Worker at `threaded/worker.node.js`.
  - Tests run the real protocol over a same-thread MessageChannel,
    including a 60-step sync-vs-worker parity check (identical to 6 dp).
- Demo runs threaded (`WorkerWorld` + COOP/COEP headers for SAB).

### Fixed

- **Raycast completeness**: bodies are stored in their center cell only
  but bulge up to `cellSize/2` into the 26 neighbors, so a ray clipping
  a sphere's corner without entering its center cell missed the hit —
  including hits landing exactly at `maxDistance`. Candidates now come
  from the 3x3x3 block around the walked cell (full block at the origin
  cell, 9-cell leading face per step after). Verified by a seeded
  differential test against an independent O(N) quadratic oracle.

### Performance

- **Settled pile (WARMUP=240) N=8000: 34.2 -> 9.2 ms/step (3.7x)** —
  under the 16.67 ms 60fps budget; docs/issues/001 definition of done
  met. Fixed-box pile N=8000: 48.7 -> 9.2 (5.3x). Scattered regime
  untouched (1.285 -> 1.286 ms/1000).
- Raycast: 63-68 us/ray at N=4096 vs ~160 us/ray for a brute-force O(N)
  oracle at the same density. The corrected candidate set costs ~6x the
  old incomplete walk; a coarse occupancy filter is the documented
  follow-up if ray-heavy workloads appear.
- Threaded (bench/threaded.bench.ts, real worker_threads + SAB):
  `kick()` 0.014 ms main-thread; frame time with a 4 ms render workload
  at N=8192 **8.84 ms pipelined vs 14.96 ms serial** (113 fps vs 67);
  N=1024 step fully hidden (4.03 vs 4.80 ms).

## [0.2.2] — 2026-09-07

Metadata-only release: adds the "Flit Physics" display title for the MCP
Registry listing (registry versions are immutable; titles ride versions).
No code changes.

## [0.2.1] — 2026-09-07

Packages the MCP server as an npx-runnable bin (`npx flit-physics`),
adds `mcpName` for MCP Registry ownership verification, and publishes the
server to the official MCP Registry. No engine changes.

## [0.2.0] — 2026-09-07

### Added

- **Sequential-impulse velocity solver**: flat contact list, 4 iterated
  impulses with accumulation/clamping, restitution as a velocity bias with
  a 1 m/s sleep threshold (resting contacts no longer jitter), and split
  positional correction (80%/step, 2 mm slop) that no longer injects energy.
- **Friction** via a public 16-entry fixed-point `frictionLut`
  (1/256 tangential retention indexed by squared tangential speed; bucket 0
  snaps slow contacts to a stop). Generated from the `friction` world
  preset (default 0.3), hand-tunable. Planes use the same LUT.
- **`world.raycast(origin, direction, maxDistance?)`** — Amanatides-Woo
  voxel walk over the Morton broadphase grid; returns hits sorted by
  distance with body index, point, and normal.
- `SpatialHash.getCellBodies` for voxel walks.
- `flit_raycast` tool in the MCP server.
- `WorldOptions`: `friction`, `velocityIterations`.
- `docs/issues/001-settled-pile-performance.md` — open, self-contained
  brief on dense-pile solver cost (island sleeping etc.).

### Fixed

- `rayStamp` no longer shrinks below its initial capacity on
  small-capacity worlds (caught by the capacity test).

### Performance

- N=1024 step: 0.83 → 0.93 ms (+11%) for real velocity solving.
- Documented settled-pile caveat: with gravity, bodies form dense floor
  piles within ~2-4s; steady state is contact-solver dominated
  (~4.3 ms/1000 at N=8000). See the issue brief.

## [0.1.0] — 2026-09-06

First public release: `World` (spheres, semi-implicit Euler, impulse
contacts, ground plane, AABB bounds), Morton spatial-hash broadphase with
ordered probing, distance/bit/Morton utility modules (FLANN-derived
distances under retained BSD-2 notice), three.js demo (`npm run demo`),
MCP server (`npm run mcp`), and the `flit` agent skill.
