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

describe('puntos y tiers en lugar de karma (CRO-72)', () => {
  it.each(['docs/api-contract.md', 'README.md', '.env.example'])('%s ya no menciona karma', (ruta) => {
    expect(readFileSync(resolve(RAIZ, ruta), 'utf8')).not.toMatch(/karma/i);
  });

  it.each(['docs/api-contract.md', 'README.md'])('%s describe las reglas nuevas: +10, +2, los cuatro tiers y sus umbrales', (ruta) => {
    const texto = readFileSync(resolve(RAIZ, ruta), 'utf8');
    for (const termino of ['+10', '+2', 'CROWD_BABY', 'CROWD_EXPLORER', 'CROWD_COLLABORATOR', 'CROWD_ROYALTY', '0-49', '50-149', '150-299', '300']) {
      expect(texto, termino).toContain(termino);
    }
  });

  it('el entorno ya no tiene topes diarios ni puntos por accion', () => {
    expect(Object.keys(esquemaEntorno.shape).filter((clave) => clave.startsWith('KARMA_'))).toEqual([]);
  });

  it('el codigo fuente solo nombra karma en las columnas congeladas que se dejan de usar', () => {
    const conKarma = archivos('src').filter((ruta) => /karma/i.test(readFileSync(resolve(RAIZ, ruta), 'utf8')));
    expect(conKarma.sort()).toEqual([
      'src/dao/impl/sequelize/ValidacionDAOSequelize.ts',
      'src/dao/impl/sequelize/model/UsuarioModel.ts',
      'src/dao/impl/sequelize/model/ValidacionModel.ts',
    ]);
  });
});
