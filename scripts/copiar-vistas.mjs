/**
 * Build step: tsc only emits .ts, so the static views (src/view/*.html) are copied next to the compiled
 * `VistaRestablecer.js` that reads them at startup (`dist/view`).
 */
import { cpSync } from 'node:fs';

cpSync('src/view', 'dist/view', { recursive: true, filter: (origen) => !origen.endsWith('.ts') });
