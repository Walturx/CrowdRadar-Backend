/** Guards the test runner configuration itself (review R3-203, R3-205). */
import { describe, expect, it } from 'vitest';
import configuracion from '../../vitest.config.js';
import { TIMEOUT_PROCESO_HIJO_MS } from '../support/tiempos.js';

describe('vitest.config', () => {
  it('prohibe .only para que ninguna prueba quede aislada por accidente (allowOnly: false)', () => {
    expect(configuracion.test?.allowOnly).toBe(false);
  });

  it('testTimeout cubre el timeout de los procesos hijo de server.arranque.test.ts', () => {
    expect(configuracion.test?.testTimeout).toBeGreaterThanOrEqual(TIMEOUT_PROCESO_HIJO_MS);
  });
});
