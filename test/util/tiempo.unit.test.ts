/** Time constants live once in util/tiempo.ts (R2-1004): the values, and no other module of src/ defines its own. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MS_POR_DIA, MS_POR_HORA, MS_POR_MINUTO, MS_POR_SEGUNDO } from '../../src/util/tiempo.js';

const SRC = resolve(import.meta.dirname, '..', '..', 'src');

function fuentes(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) =>
    entrada.isDirectory() ? fuentes(join(carpeta, entrada.name)) : [join(carpeta, entrada.name)],
  );
}

describe('util/tiempo', () => {
  it('cada constante es la anterior por su factor', () => {
    expect(MS_POR_SEGUNDO).toBe(1000);
    expect(MS_POR_MINUTO).toBe(60 * MS_POR_SEGUNDO);
    expect(MS_POR_HORA).toBe(60 * MS_POR_MINUTO);
    expect(MS_POR_DIA).toBe(24 * MS_POR_HORA);
  });

  it('ningun otro modulo de src/ vuelve a definir una constante MS_POR_*', () => {
    const duplicadas = fuentes(SRC)
      .filter((ruta) => !ruta.endsWith(join('util', 'tiempo.ts')))
      .filter((ruta) => /\bconst MS_POR_(SEGUNDO|MINUTO|HORA|DIA)\b/.test(readFileSync(ruta, 'utf8')));
    expect(duplicadas).toEqual([]);
  });
});
