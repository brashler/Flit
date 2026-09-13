import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  resolve: {
    alias: {
      // Demo imports the engine straight from source — no build step needed.
      flit: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  server: {
    headers: {
      // crossOriginIsolated => SharedArrayBuffer => zero-copy threaded sim.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
