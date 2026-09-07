---
name: flit
description: Add simple 3D sphere physics (gravity, bouncing, collisions) to three.js / 3js scenes, one-shot browser games, and demos using the Flit engine. Use when a task involves lightweight game physics, bouncing balls, particle simulations, collision detection, or a three.js scene that needs physics without a heavy engine. Includes a no-code MCP server option.
---

# Flit — tiny physics for three.js games

Flit is a tiny TypeScript physics engine: point-sphere particles, gravity,
impulse collisions, ground plane and box walls, Morton spatial-hash
broadphase. CPU, single-threaded, zero native deps. Repo:
https://github.com/brashler/Flit

Use it when a three.js/3js game, demo, or toy needs balls/particles that
fall, bounce, and collide — and a full engine (Rapier, cannon, Jolt) is
overkill.

## Option A: 30-second recipe (library)

Easiest: `npm i flit-physics` and `import { World } from 'flit-physics'`.

Or consume from source (best for hacking on the engine itself):

```bash
git clone https://github.com/brashler/Flit.git
cd Flit && npm install
```

```ts
// vite.config.ts — alias flit straight at the engine source
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
export default defineConfig({
  resolve: { alias: { flit: fileURLToPath(new URL('./Flit/src/index.ts', import.meta.url)) } },
});
```

Minimal bouncing-balls scene (the proven pattern from `demo/main.ts`):

```ts
import { InstancedMesh, Matrix4, MeshStandardMaterial, SphereGeometry } from 'three';
import { World } from 'flit';

const world = new World({
  restitution: 0.6,                       // bounciness, 0..1
  groundY: 0,                             // floor plane (null disables)
  bounds: { min: [-9, 0, -9], max: [9, 12, 9] }, // optional walls
});
for (let i = 0; i < 200; i++) {
  world.addParticle({
    position: [(Math.random() - 0.5) * 14, 4 + Math.random() * 8, (Math.random() - 0.5) * 14],
    velocity: [(Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6],
    radius: 0.35,
    mass: 1,                              // 0 = static
  });
}

const balls = new InstancedMesh(new SphereGeometry(1, 20, 14), new MeshStandardMaterial(), 200);
const m = new Matrix4();

// per frame, fixed timestep:
world.step(1 / 60);
for (let i = 0; i < world.count; i++) {
  const r = world.radiusOf(i);
  m.makeScale(r, r, r);
  m.setPosition(world.positions[i * 3], world.positions[i * 3 + 1], world.positions[i * 3 + 2]);
  balls.setMatrixAt(i, m);
}
balls.instanceMatrix.needsUpdate = true;
```

Key facts: `world.positions`/`velocities` are live flat `Float32Array`s (3 per
body); indices from `addParticle` are stable; use a fixed timestep;
`world.count` is the live body count. Full working demo: `npm run demo` in
the repo (220 balls, `?n=8000` for load testing).

## Option B: no-code recipe (MCP server)

For agents that should drive a sim without embedding the library, the repo
ships an MCP server (stdio):

```json
{
  "mcpServers": {
    "flit": {
      "command": "npx",
      "args": ["vite-node", "mcp/server.ts"],
      "cwd": "<path-to-Flit-clone>"
    }
  }
}
```

Tools: `flit_info` (meta) · `flit_reset` (gravity/restitution/ground/bounds) ·
`flit_spawn` (presets: rain, explosion, grid, fountain — auto-configures
matching world) · `flit_add_particles` · `flit_step` (returns flat xyz
positions) · `flit_state` (positions + radii for InstancedMesh sync).

Typical flow: `flit_spawn({preset: "rain", count: 200})` → loop
`flit_step({steps: 1})` and copy `positions` into instance matrices.

## Performance envelope (measured, don't guess)

- ~0.83 ms/step at 1,000 bodies; flat O(N) ≈ 1.2 ms per 1,000 at constant
  density through 8,000. 60fps holds to ~5,000 balls in a tight box.
- Pair volume scales with density (physics, not algorithm): dense piles of
  8k+ are the known wall. Keep games in the sparse-to-medium regime.

## Rules for working ON the engine (contributing agents)

1. Measure before and after any perf change (`npm run bench`,
   `npm run bench:scaling`). Numbers go in the commit message. Never
   guess where the time goes — instrument first.
2. `npm test` and `npx tsc --noEmit` must pass before every commit.
3. Settled by measurement — do not re-litigate without new data:
   63-bit BigInt cell keys (13× alloc regression), sorted-array +
   binary-search broadphase (1.4× slower than Map probing), npm morton
   codecs (7–142× slower than in-house). Details in commit history.
4. Third-party code keeps its notices. `src/distances-flann.ts` is FLANN
   (BSD-2) — the header stays. See `THIRD_PARTY_NOTICES.md`. Never strip
   attribution, never add code whose license you can't name.
5. Small diffs, one concept per commit. The library has no three.js
   dependency — keep it that way (three is a demo/dev concern only).

## File map

- `src/world.ts` — engine core (particles, integration, contact solver)
- `src/spatial-hash.ts` — Morton broadphase (ordered-probe visiting)
- `src/morton.ts`, `src/bit-utils.ts`, `src/approx-distance.ts`,
  `src/distances-flann.ts` — utilities (see file headers for provenance)
- `bench/` — deterministic benchmarks (broadphase, world step, scaling, lib bake-off)
- `demo/` — three.js demo (the integration reference)
- `mcp/server.ts` — MCP server
- `test/` — vitest suite
