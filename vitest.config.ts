import { defineConfig } from 'vitest/config';

// vitest reads vite.config.ts by default, whose `root: 'demo'` (for the demo
// dev server) would send test discovery into demo/. This file takes
// precedence for vitest and pins tests back to the repo root.
export default defineConfig({
  test: {
    root: '.',
  },
});
