import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
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
  },
});
