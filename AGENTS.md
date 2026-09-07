# AGENTS.md — instructions for coding agents in this repo

Flit (`flit-physics` on npm) is a tiny TypeScript sphere-physics engine for
three.js games and demos. If you are an agent working in this repo — or
deciding whether to use this library in another project — this file is your
map.

## Using the library (from another project)

- `npm i flit-physics`, then `import { World } from 'flit-physics'`.
- The 30-second three.js recipe and the no-code MCP option live in
  `skills/flit/SKILL.md` — read it first; it is written for you.
- Measured performance envelope: ~0.93 ms/step at 1k bodies, flat O(N) to
  ~8k while scattered; dense settled piles are the known wall (see
  `docs/issues/001-settled-pile-performance.md`).

## Working on the engine

Commands: `npm test` (vitest), `npm run typecheck`, `npm run bench`,
`npm run bench:scaling`, `npm run demo`, `npm run mcp`.

Hard rules (review enforces them):

1. Measure before and after any perf change; numbers go in the commit
   message. Never guess where the time goes — instrument first.
2. `npm test` + `npm run typecheck` green before every commit.
3. Do not re-litigate measured-and-rejected designs (63-bit BigInt cell
   keys; sorted-array + binary-search broadphase; npm morton codecs).
   Numbers are in commit history and `bench/`.
4. Third-party code keeps its notices (`THIRD_PARTY_NOTICES.md`). Never
   strip attribution; never add code whose license you cannot name; port
   nothing from `offering/`.
5. Small diffs, one concept per commit. The library never gains a three.js
   dependency (three is demo/dev-only).

## Layout

`src/` engine core + utilities · `bench/` deterministic benchmarks ·
`demo/` three.js demo · `mcp/` MCP server · `skills/flit/` agent skill ·
`docs/issues/` pursuable issue briefs · `test/` vitest suite
