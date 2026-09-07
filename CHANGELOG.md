# Changelog

All notable changes to Flit. Semver-ish while 0.x: minor = new features,
patch = fixes.

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
