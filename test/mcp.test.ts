import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const callJson = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as Array<{ type: string; text: string }>)[0].text;
  return JSON.parse(text);
};

describe('flit MCP server', () => {
  it(
    'serves tools and runs a simulation over stdio',
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['node_modules/vite-node/vite-node.mjs', 'mcp/server.ts'],
        stderr: 'pipe',
      });
      const client = new Client({ name: 'flit-test', version: '0.0.1' });
      await client.connect(transport);

      try {
        const tools = await client.listTools();
        const names = tools.tools.map((t) => t.name).sort();
        expect(names).toEqual([
          'flit_add_particles',
          'flit_info',
          'flit_raycast',
          'flit_reset',
          'flit_spawn',
          'flit_state',
          'flit_step',
        ]);

        const info = await callJson(client, 'flit_info');
        expect(info.repo).toContain('Flit');

        await callJson(client, 'flit_reset', { gravity: [0, -10, 0], groundY: null });
        const added = await callJson(client, 'flit_add_particles', {
          particles: [{ position: [0, 10, 0] }],
        });
        expect(added.indices).toEqual([0]);

        // semi-implicit Euler: after dt=0.1, vy=-1 and y=9.9
        const stepped = await callJson(client, 'flit_step', { dt: 0.1, steps: 1 });
        expect(stepped.count).toBe(1);
        expect(stepped.positions).toHaveLength(3);
        expect(stepped.positions[1]).toBeCloseTo(9.9, 4);

        const spawned = await callJson(client, 'flit_spawn', { preset: 'rain', count: 10 });
        expect(spawned.count).toBe(10);

        const state = await callJson(client, 'flit_state');
        expect(state.positions).toHaveLength(30);
        expect(state.radii).toHaveLength(10);

        await callJson(client, 'flit_reset', { gravity: [0, 0, 0], groundY: null });
        await callJson(client, 'flit_add_particles', { particles: [{ position: [3, 0, 0], radius: 0.5 }] });
        const ray = await callJson(client, 'flit_raycast', { origin: [0, 0, 0], direction: [1, 0, 0] });
        expect(ray.hits).toHaveLength(1);
        expect(ray.hits[0].distance).toBeCloseTo(2.5, 4);

        // Heightfield terrain over MCP: a ball rests, settles, and the
        // terrain raycast reports index -1 behind the body hit.
        await callJson(client, 'flit_reset', {
          groundY: null,
          heightfield: { rows: 2, cols: 2, cellSize: 10, origin: [-5, 0, -5], heights: [2, 2, 2, 2] },
        });
        const info2 = await callJson(client, 'flit_info');
        expect(info2.heightfield).toEqual({ rows: 2, cols: 2, cellSize: 10 });
        await callJson(client, 'flit_add_particles', { particles: [{ position: [0, 5, 0], radius: 0.5 }] });
        const terrainStep = await callJson(client, 'flit_step', { steps: 240 });
        expect(terrainStep.positions[1]).toBeCloseTo(2.5, 2);
        expect(terrainStep.settledCount).toBe(1);
        const terrainRay = await callJson(client, 'flit_raycast', {
          origin: [0, 5, 0],
          direction: [0, -1, 0],
        });
        expect(terrainRay.hits).toHaveLength(2);
        expect(terrainRay.hits[0].index).toBe(0); // the settled ball still reports
        expect(terrainRay.hits[1].index).toBe(-1); // terrain behind it
        expect(terrainRay.hits[1].distance).toBeCloseTo(3, 3);
      } finally {
        await client.close();
      }
    },
    30000,
  );
});
