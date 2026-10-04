/**
 * docs/contratos-streams.md is the hand-off of change 0: per stream, the interfaces it
 * implements, the files it owns and the shared ports that need a contract PR. It must
 * name every frozen port so no stream starts from a stale list.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const doc = readFileSync(resolve(RAIZ, 'docs/contratos-streams.md'), 'utf8');

function archivos(dir: string, filtro: RegExp): string[] {
  const absoluto = resolve(RAIZ, dir);
  if (!existsSync(absoluto)) return [];
  return readdirSync(absoluto, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && filtro.test(e.name))
    .map((e) => relative(RAIZ, join(e.parentPath, e.name)).split(sep).join('/'));
}

describe('docs/contratos-streams.md', () => {
  it.each(['M1', 'M2', 'M3', 'M4', 'M5', 'M6'])('tiene una seccion para el stream %s con sus tres listas', (stream) => {
    const seccion = doc.split(/^## /m).find((s) => s.startsWith(`${stream} `));
    expect(seccion, `seccion ${stream}`).toBeDefined();
    expect(seccion).toMatch(/Interfaces to implement/);
    expect(seccion).toMatch(/Owned files/);
    expect(seccion).toMatch(/Shared ports/);
  });

  const puertos = [
    ...archivos('src/service', /^[A-Z]\w+(?<!Impl)\.ts$/).filter((f) => !f.includes('/impl/')),
    ...archivos('src/facade', /\.ts$/),
    ...archivos('src/pattern/strategy', /^Estrategia\w+\.ts$/),
    ...archivos('src/pattern/observer', /^Saturacion(Observer|Subject|CambiadaEvento)\.ts$/),
    ...archivos('src/adapter', /^[A-Z]\w+\.ts$/).filter((f) => !f.includes('/impl/')),
    ...archivos('src/dao', /^[A-Z]\w+DAO\.ts$/).filter((f) => !f.includes('/impl/')),
  ];

  it('encuentra los puertos congelados (guarda contra un glob vacio)', () => {
    expect(puertos.length).toBeGreaterThanOrEqual(35);
  });

  it.each(puertos)('nombra el puerto %s', (ruta) => {
    expect(doc).toContain(ruta.replace(/^src\//, ''));
  });

  it('cada puerto de servicio y fachada declara el patron y el stream duenio en su doc comment', () => {
    for (const ruta of puertos.filter((p) => /src\/(service|facade)\//.test(p))) {
      const fuente = readFileSync(resolve(RAIZ, ruta), 'utf8');
      expect(fuente, ruta).toMatch(/Owner: M[1-6]|Owner: C0/);
      expect(fuente, ruta).toMatch(/Pattern:/);
    }
  });
});
