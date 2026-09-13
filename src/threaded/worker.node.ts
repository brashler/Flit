import { parentPort } from 'node:worker_threads';

import { install } from './worker-core.js';

/**
 * node:worker_threads entry (tests, benches, headless servers). Point a
 * `new Worker(...)` at this file to run WorkerWorld server-side.
 */
const port = parentPort;
if (port) {
  install(port, () => port.close());
}
