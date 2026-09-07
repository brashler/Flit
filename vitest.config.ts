import { defineConfig } from 'vitest/config';

// vitest reads vite.config.ts by default, whose `root: 'demo'` (for the demo
// dev server) would send test discovery into demo/. This file takes
// precedence for vitest and pins tests back to the repo root.
export default defineConfig({
  resolve: {
    alias: {
      // The MCP server self-imports 'flit-physics' (for the built bin);
      // in tests it must resolve to current source, not stale dist/.
      'flit-physics': new URL('./src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    root: '.',
  },
});
