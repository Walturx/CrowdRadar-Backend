import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
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
