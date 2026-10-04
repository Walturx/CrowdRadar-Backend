/** Logger factory (pino) and the system clock. */
import { describe, expect, it } from 'vitest';
import { crearLogger } from '../../src/util/logger.js';
import { relojSistema } from '../../src/util/Reloj.js';

describe('crearLogger', () => {
  it('redacta secretos en lo que escribe', () => {
    const lineas: string[] = [];
    const logger = crearLogger('info', { write: (linea: string) => void lineas.push(linea) });
    logger.info({ usuario: 'ana', password: 'Secreta123', datos: { token: 'jwt-abc', passwordHash: '$2b$x' } }, 'evento');
    const texto = lineas.join('');
    expect(texto).toContain('ana');
    expect(texto).toContain('[REDACTADO]');
    for (const secreto of ['Secreta123', 'jwt-abc', '$2b$x']) expect(texto).not.toContain(secreto);
  });

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
