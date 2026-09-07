#!/usr/bin/env node
/**
 * Flit MCP server — lets agents drive the physics engine directly:
 * reset a world, spawn preset scenes, step, and read back flat position
 * buffers shaped for three.js InstancedMesh syncing.
 *
 * Run: npm run mcp (source, via vite-node) or npx flit-physics (built bin).
 * Stdio transport; no stdout logging allowed here.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { World } from 'flit-physics';

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
const MAX_PARTICLES = 5000;

let world = new World();

const asJson = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
});

const flatPositions = (): number[] =>
  Array.from(world.positions.subarray(0, world.count * 3));

const flatRadii = (): number[] => {
  const out: number[] = [];
  for (let i = 0; i < world.count; i += 1) out.push(world.radiusOf(i));
  return out;
};

const server = new McpServer({
  name: 'flit',
  version: '0.1.0',
});

server.registerTool(
  'flit_info',
  {
    title: 'Engine info',
    description:
      'Flit engine metadata: what it is, current world state, and the repo. Good first call.',
    inputSchema: {},
  },
  async () =>
    asJson({
      name: 'flit',
      about:
        'Tiny sphere-physics engine for three.js: gravity, impulse contacts, ' +
        'Morton spatial-hash broadphase. CPU, single-threaded, flat Float32Arrays.',
      repo: 'https://github.com/brashler/Flit',
      count: world.count,
      gravity: Array.from(world.gravity),
      restitution: world.restitution,
      groundY: world.groundY,
      bounds: world.bounds
        ? { min: Array.from(world.bounds.min), max: Array.from(world.bounds.max) }
        : null,
    }),
);

server.registerTool(
  'flit_reset',
  {
    title: 'Reset world',
    description: 'Destroy all particles and reconfigure the world.',
    inputSchema: {
      gravity: vec3Schema.optional().describe('Default [0, -9.81, 0]'),
      restitution: z.number().min(0).max(1).optional().describe('0 = clay, 1 = superball. Default 0.4'),
      groundY: z.number().nullable().optional().describe('Floor plane height. Default 0, null disables'),
      bounds: z
        .object({ min: vec3Schema, max: vec3Schema })
        .nullable()
        .optional()
        .describe('Optional AABB walls, e.g. {min:[-9,0,-9], max:[9,12,9]}'),
    },
  },
  async (args) => {
    world = new World({
      gravity: args.gravity,
      restitution: args.restitution,
      groundY: args.groundY === undefined ? undefined : args.groundY,
      bounds: args.bounds === undefined ? undefined : args.bounds,
    });
    return asJson({ ok: true, count: world.count });
  },
);

const particleSchema = z.object({
  position: vec3Schema,
  velocity: vec3Schema.optional(),
  radius: z.number().positive().optional().describe('Default 0.5'),
  mass: z.number().nonnegative().optional().describe('Default 1; 0 = static'),
});

server.registerTool(
  'flit_add_particles',
  {
    title: 'Add particles',
    description: 'Add custom particles. Returns the assigned indices.',
    inputSchema: {
      particles: z.array(particleSchema).min(1).max(MAX_PARTICLES),
    },
  },
  async ({ particles }) => {
    if (world.count + particles.length > MAX_PARTICLES) {
      return asJson({ ok: false, error: `would exceed MAX_PARTICLES (${MAX_PARTICLES})` });
    }
    const indices = particles.map((p) => world.addParticle(p));
    return asJson({ ok: true, indices, count: world.count });
  },
);

server.registerTool(
  'flit_spawn',
  {
    title: 'Spawn preset scene',
    description:
      'One-shot scene spawners for games/demos: "rain" drops balls from above, ' +
      '"explosion" blasts them outward from center, "grid" fills a lattice, ' +
      '"fountain" emits upward from a point. World is auto-configured with ' +
      'matching ground + walls.',
    inputSchema: {
      preset: z.enum(['rain', 'explosion', 'grid', 'fountain']),
      count: z.number().int().min(1).max(MAX_PARTICLES).default(200),
      size: z.number().positive().default(8).describe('Half-extent of the play area'),
      radius: z.number().positive().default(0.35).describe('Ball radius (uniform)'),
      restitution: z.number().min(0).max(1).default(0.6),
      speed: z.number().positive().default(8).describe('explosion/fountain launch speed'),
    },
  },
  async ({ preset, count, size, radius, restitution, speed }) => {
    world = new World({
      restitution,
      groundY: 0,
      bounds: { min: [-size, 0, -size], max: [size, size * 2, size] },
    });

    const rand = Math.random;
    for (let i = 0; i < count; i += 1) {
      if (preset === 'rain') {
        world.addParticle({
          position: [(rand() - 0.5) * size * 1.6, size * (1 + rand()), (rand() - 0.5) * size * 1.6],
          velocity: [(rand() - 0.5) * 4, 0, (rand() - 0.5) * 4],
          radius,
        });
      } else if (preset === 'explosion') {
        const theta = rand() * Math.PI * 2;
        const phi = Math.acos(2 * rand() - 1);
        world.addParticle({
          position: [(rand() - 0.5) * 2, size * 0.6 + (rand() - 0.5) * 2, (rand() - 0.5) * 2],
          velocity: [
            Math.sin(phi) * Math.cos(theta) * speed,
            Math.cos(phi) * speed,
            Math.sin(phi) * Math.sin(theta) * speed,
          ],
          radius,
        });
      } else if (preset === 'grid') {
        const side = Math.ceil(Math.cbrt(count));
        const spacing = Math.min((size * 1.6) / side, radius * 2.2);
        const idx = i;
        world.addParticle({
          position: [
            ((idx % side) - side / 2) * spacing,
            radius + (Math.floor(idx / (side * side)) + 0.5) * spacing,
            ((Math.floor(idx / side) % side) - side / 2) * spacing,
          ],
          radius,
        });
      } else {
        // fountain
        world.addParticle({
          position: [(rand() - 0.5) * radius * 2, radius, (rand() - 0.5) * radius * 2],
          velocity: [(rand() - 0.5) * speed * 0.3, speed * (0.8 + rand() * 0.4), (rand() - 0.5) * speed * 0.3],
          radius,
        });
      }
    }
    return asJson({ ok: true, preset, count: world.count, radius });
  },
);

server.registerTool(
  'flit_step',
  {
    title: 'Step simulation',
    description:
      'Advance the world. Returns flat xyz positions shaped for direct use in ' +
      'three.js InstancedMesh matrix updates.',
    inputSchema: {
      dt: z.number().positive().max(0.1).default(1 / 60),
      steps: z.number().int().min(1).max(10000).default(1),
    },
  },
  async ({ dt, steps }) => {
    const t0 = performance.now();
    for (let s = 0; s < steps; s += 1) world.step(dt);
    const msPerStep = (performance.now() - t0) / steps;
    return asJson({ steps, msPerStep, count: world.count, positions: flatPositions() });
  },
);

server.registerTool(
  'flit_state',
  {
    title: 'Read state',
    description: 'Flat xyz positions + per-ball radii (for InstancedMesh sync).',
    inputSchema: {},
  },
  async () => asJson({ count: world.count, positions: flatPositions(), radii: flatRadii() }),
);

server.registerTool(
  'flit_raycast',
  {
    title: 'Raycast',
    description:
      'Cast a ray through the scene (Amanatides-Woo voxel walk over the broadphase grid). ' +
      'Returns hits sorted by distance: body index, distance, point, normal.',
    inputSchema: {
      origin: vec3Schema,
      direction: vec3Schema.describe('Need not be normalized'),
      maxDistance: z.number().positive().optional(),
    },
  },
  async ({ origin, direction, maxDistance }) =>
    asJson({ hits: world.raycast(origin, direction, maxDistance ?? Infinity) }),
);

await server.connect(new StdioServerTransport());
