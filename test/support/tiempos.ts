/**
 * Longest a test may wait for a spawned server process. Vitest's `testTimeout` must be at least
 * this long, otherwise the test is killed before its own, clearer timeout fires (see vitest.config.ts).
 */
export const TIMEOUT_PROCESO_HIJO_MS = 30_000;
