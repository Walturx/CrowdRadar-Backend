import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Files that reset or replace modules (`vi.resetModules`, `vi.mock` of app modules, `vi.stubEnv` read at import time)
 * or the ConfiguracionApp singleton. They keep a fresh module graph per file; with a shared graph their copies of the
 * exception classes leak into the next file of the worker and `instanceof` in the error middleware stops matching.
 * Add a file here when it needs that kind of isolation.
 */
export const ARCHIVOS_AISLADOS = [
  'test/config/server.inproceso.api.test.ts',
  'test/config/ConfiguracionApp.unit.test.ts',
  'test/database/historialSintetico.unit.test.ts',
];

export default defineConfig({
  test: {
    environment: 'node',
    // Fails any test whose request ends in an unexpected 500 ERROR_INTERNO (see test/support/guardiaErrorInterno.ts).
    setupFiles: ['test/support/setupGuardiaErrorInterno.ts'],
    // Must stay >= TIMEOUT_PROCESO_HIJO_MS (test/support/tiempos.ts): tests that spawn the server wait that long.
    testTimeout: 45000,
    // A stray `it.only` must fail the run instead of silently skipping the rest of the suite.
    allowOnly: false,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
    // `include` lives in each project (with `extends: true` arrays would merge with a root one).
    // Most files only build apps and in-memory doubles, so they share one module graph per worker (`isolate: false`):
    // the app modules are imported once per worker instead of once per file, which was half of the suite's time.
    // Each file still gets its own setup file run and its own app/container instances.
    projects: [
      {
        extends: true,
        test: {
          name: 'compartido',
          include: ['test/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...ARCHIVOS_AISLADOS],
          isolate: false,
        },
      },
      { extends: true, test: { name: 'aislado', include: ARCHIVOS_AISLADOS, isolate: true } },
    ],
  },
});
