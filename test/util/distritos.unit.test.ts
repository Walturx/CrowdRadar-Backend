/** The district list the app shows in its dropdown: 43 of Metropolitan Lima plus 7 of Callao. */
import { describe, expect, it } from 'vitest';
import { DISTRITOS, DISTRITOS_CALLAO, DISTRITOS_LIMA } from '../../src/util/distritos.js';

describe('DISTRITOS', () => {
  it('tiene los 43 de Lima Metropolitana y los 7 del Callao, sin repetidos', () => {
    expect(DISTRITOS_LIMA).toHaveLength(43);
    expect(DISTRITOS_CALLAO).toHaveLength(7);
    expect(DISTRITOS).toHaveLength(50);
    expect(new Set(DISTRITOS).size).toBe(50);
  });

  it('esta en orden alfabetico y cada nombre cabe en la columna (60)', () => {
    expect([...DISTRITOS]).toEqual([...DISTRITOS].sort((a, b) => a.localeCompare(b, 'es')));
    expect(DISTRITOS.every((d) => d.length >= 2 && d.length <= 60)).toBe(true);
  });
});
