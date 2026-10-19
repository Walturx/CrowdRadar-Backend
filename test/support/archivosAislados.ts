/**
 * Files that reset or replace modules (`vi.resetModules`, `vi.mock` of app modules, `vi.stubEnv` read at import time),
 * write `process.env` or the ConfiguracionApp singleton. They keep a fresh module graph per file; with a shared graph
 * their copies of the exception classes leak into the next file of the worker and `instanceof` in the error middleware
 * stops matching. vitest.config.ts imports this list; test/support/aislamiento.guard.test.ts fails when a test file
 * does any of that without being listed here.
 */
export const ARCHIVOS_AISLADOS = [
  'test/config/server.inproceso.api.test.ts',
  'test/config/ConfiguracionApp.unit.test.ts',
  'test/database/historialSintetico.unit.test.ts',
  // Writes ADMIN_* / BCRYPT_COSTO into process.env around the admin seeder (restored after each case).
  'test/database/herramientas.unit.test.ts',
];
