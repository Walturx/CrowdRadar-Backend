/** Logger factory (pino) and the system clock. */
import { describe, expect, it } from 'vitest';
import { crearLogger } from '../../src/util/logger.js';
import { relojSistema } from '../../src/util/Reloj.js';

describe('crearLogger', () => {
  it('respeta el nivel configurado', () => {
    expect(crearLogger('debug').level).toBe('debug');
    expect(crearLogger('silent').level).toBe('silent');
  });
});

describe('relojSistema', () => {
  it('ahora() devuelve la fecha actual del sistema', () => {
    const antes = Date.now();
    const ahora = relojSistema.ahora().getTime();
    expect(ahora).toBeGreaterThanOrEqual(antes);
    expect(ahora).toBeLessThanOrEqual(Date.now());
  });
});
