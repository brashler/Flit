# Changelog

All notable changes to Flit. Semver-ish while 0.x: minor = new features,
patch = fixes.

## Unreleased

### Added

- **`WorkerWorld`** (`src/threaded/`) — the engine now steps on a
  background thread by default. `kick(dt)` starts a step and returns in
  ~0.014 ms; `waitForUpdate()` resolves when it lands (`stepOnce()` =
  both). Rendering reads `positions`, a tear-free ping-pong view into two
  SharedArrayBuffers (zero-copy), with a structured-clone fallback when
  SAB is unavailable (page not cross-origin isolated). Radii are mirrored
  main-side from spawn specs; raycasts round-trip through the worker.
  Fixed capacity (no growth) in threaded mode. `World` is untouched and
  stays the sync reference — the worker is a wrapper, not a fork.
  - Browser: default worker bundled via `new URL(..., import.meta.url)`.
  - Node: pass a `node:worker_threads` Worker at `threaded/worker.node.js`.
  - Tests run the real protocol over a same-thread MessageChannel,
    including a 60-step sync-vs-worker parity check (identical to 6 dp).
- Demo now runs threaded (`WorkerWorld` + COOP/COEP headers for SAB).

### Performance (bench/threaded.bench.ts, real worker_threads + SAB)

- `kick()`: 0.014 ms on the main thread (N=1024 and N=8192).
- Frame time with a 4 ms render workload, N=8192: **8.84 ms pipelined vs
  14.96 ms serial** (113 fps vs 67). N=1024: step fully hidden
  (4.03 vs 4.80 ms).
- Worker roundtrip ≈ sync step time (IPC overhead below measurement
  noise at both scales).

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
