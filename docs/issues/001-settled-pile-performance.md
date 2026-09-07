# Issue 001 — Settled-pile step cost is contact-solver dominated

**Status:** open, parked · **Area:** solver / performance · **Difficulty:** medium (directions 1-2), hard (direction 4)

## Summary

With gravity on, bodies in any scene eventually rain into a dense floor
pile. In that steady state, `World.step` cost is dominated by the
**contact solver** (velocity iterations x contact count), not the
broadphase. At N=8000 in a settled pile we measure ~87k contacts and
~34 ms/step — about 4.3 ms per 1000 bodies, vs ~1.2 ms per 1000 for the
same N while bodies are scattered. The 60 fps budget (16.67 ms/step)
therefore holds only to roughly 3k bodies in pile state.

## Evidence (all measured, deterministic seeds)

From `bench/scaling.bench.ts` (see commit history for full series):

| State | N | ms/step | notes |
|---|---|---|---|
| scattered (WARMUP=30) | 8000 | 9.65 | flat O(N): ~1.2 ms/1000 from N=250..8000 |
| settled pile (WARMUP=240) | 8000 | ~34 | ~87k contacts, ~10.9 pairs/ball |
| settled pile (WARMUP=240) | 4000 | ~14 | ~38.5k contacts |

Phase split at N=8000 settled: broadphase ~8-9 ms of ~34 ms total —
**the broadphase is not the bottleneck.** It is a Morton-keyed uniform
grid with ordered cell-pair probing; do not re-litigate it without new
data (rejected designs and numbers are in commit history and
`bench/morton-libs.bench.ts`).

The N² one sees in a *fixed* box as N grows is crowding physics
(pairs/ball rises with density), not an algorithmic defect.

## Reproduction

```bash
npm install
npx vite-node bench/scaling.bench.ts          # scattered state (default WARMUP=30)
WARMUP=240 npx vite-node bench/scaling.bench.ts  # settled-pile state (Windows cmd: set WARMUP=240 first)
npx vite-node bench/world.bench.ts            # N=1024 baseline: ~0.93 ms/step
```

## Where the time goes (file map)

- `src/world.ts`
  - `buildContacts()` — narrowphase over broadphase candidate pairs
  - `solveVelocities()` — sequential impulses, `velocityIterations` (default 4) x contacts
  - `solvePositions()` — split positional correction, 80%/step with slop
  - `resolveGround()` / `resolveBounds()` — plane contacts (not island-aware)
- `bench/scaling.bench.ts` — the measurement harness (`WARMUP` env var)

## Candidate directions (ranked by expected value / effort)

1. **Island sleeping (medium effort, largest win).** Build islands per
   step via union-find over the contact graph (bodies + ground/bounds as
   anchors). An island whose bodies stay below velocity/energy thresholds
   for ~0.5-1s is put to sleep: skip integration and both solve stages
   for its contacts. Wake conditions: a new contact involving an awake
   body, a raycast hit (informational only — no wake needed), or an
   explicit velocity write. Box2D proves the pattern; resting piles
   become ~free. Correctness traps: never sleep mid-air bodies; sleeping
   islands must not sink or creep (skip integration entirely, don't zero
   velocities); wake must propagate through the island, not just one body.
2. **Adaptive iteration count (small).** Early-out of `solveVelocities`
   when the max per-iteration impulse magnitude falls below epsilon; and/or
   scale iterations down as contact count grows (4 at 1k contacts is not
   the right spend at 87k). Measure quality impact on the elastic-swap
   and pile-stability tests before and after.
3. **Warm starting (medium).** Persist per-contact accumulated normal
   impulses across frames, keyed by body-index pair (a Map keyed by
   `i * 2^32 + j` or by reusing contact slots when the same pair repeats).
   Fewer iterations needed for the same stability; classic Box2D-lite
   technique. Bookkeeping cost must be measured, not assumed.
4. **Agglomeration (hard, research-grade).** Condense clusters of bodies
   so chained collisions in a pile are solved at aggregate level instead
   of full pairwise resolution. Genuinely interesting, genuinely hard;
   pursue only after 1-3 are exhausted or as a deliberate research
   project. (Adjacent to ideas in the `offering/` vault — do NOT port
   anything from there; see the provenance rules below.)
5. **Solver micro-optimizations (small).** Scalarize the inner impulse
   math (the gl-matrix scratch-vec calls have per-call overhead at 87k x 4
   contacts), precompute `1/totalInvMass` per contact, keep arrays SoA.
   Expect single-digit-percent wins; measure each independently.

## Constraints (house rules — they are enforced by review)

1. **Measure, never guess.** Before/after numbers in the commit message,
   from the deterministic benches. One variable at a time. A rejected
   direction with numbers is a good commit; an unmeasured win is not.
2. **Correctness gate:** `npm test` (currently 57/57) and
   `npm run typecheck` must pass. Add tests for new behavior — sleeping
   requires at minimum: "dropped ball wakes a sleeping island",
   "sleeping pile neither sinks nor creeps over 600 steps",
   "raycast against sleeping bodies still hits".
3. **No heavy dependencies** without a written justification in the
   commit. The engine's value is being tiny.
4. **Attribution is sacred.** Third-party code keeps its notices
   (`THIRD_PARTY_NOTICES.md`). Nothing gets ported from `offering/`
   (see git history for why). No AI-generated provenance laundering.
5. Small diffs, one concept per commit. The library must not gain a
   three.js dependency.

## Definition of done

- Settled-pile (WARMUP=240) N=8000 `World.step` at or under **16.67 ms**
  on the reference dev machine, with the deterministic benches committed;
  or a documented, measured argument for a different achievable target.
- All correctness gates green, including the new sleeping/wake tests if
  direction 1 is pursued.
- No regressions in the scattered-state numbers (regime B at WARMUP=30
  stays ~flat O(N)).

## Context links

- Introduced/measured in commit `3755a5e` (velocity solver + LUT friction + raycast)
- Broadphase design: commit `f2c0521` (ordered probing; negative result on sorted-array variant)
- Repo: https://github.com/brashler/Flit
