/**
 * Karma is retired (CRO-62): every valid vote weighs the same (CRO-73), so the karma-weighted reliability variant and its
 * cap must not survive anywhere a developer or an operator would read them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esquemaEntorno } from '../../src/config/esquemaEntorno.js';

const RAIZ = resolve(import.meta.dirname, '..', '..');

function archivos(dir: string): string[] {
  return readdirSync(resolve(RAIZ, dir), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(RAIZ, join(e.parentPath, e.name)).split(sep).join('/'));
}

const REVISADOS = [...archivos('src'), ...archivos('docs'), '.env.example', 'README.md'];

/** Files of REVISADOS whose text matches `patron`. */
function quienesMencionan(patron: RegExp): string[] {
  return REVISADOS.filter((ruta) => patron.test(readFileSync(resolve(RAIZ, ruta), 'utf8')));
}

describe('peso uniforme de los votos (CRO-73)', () => {
  it('encuentra los archivos a revisar (guarda contra una lista vacia)', () => {
    expect(REVISADOS.length).toBeGreaterThan(200);
  });

  it.each(['PONDERADA_KARMA', 'TOPE_KARMA_PESO', 'PonderadaKarma', 'topeKarmaPeso'])(
    '%s ya no existe en el codigo, .env.example, el README ni docs/',
    (termino) => {
      expect(quienesMencionan(new RegExp(termino))).toEqual([]);
    },
  );

  it('el entorno ya no ofrece elegir ni topar el peso de los votos', () => {
    expect(Object.keys(esquemaEntorno.shape)).not.toContain('CONFIABILIDAD_ESTRATEGIA');
    expect(Object.keys(esquemaEntorno.shape)).not.toContain('TOPE_KARMA_PESO');
  });
});
