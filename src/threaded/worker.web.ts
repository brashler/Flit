import { install } from './worker-core.js';
import type { PortLike } from './ports.js';

/**
 * Browser worker entry. Referenced by WorkerWorld's default worker URL;
 * bundlers (Vite/webpack) trace `new URL(..., import.meta.url)` and bundle
 * this file. Declared structurally — the library build has no DOM lib.
 */
declare const self: PortLike & { close(): void };

install(self, () => self.close());
