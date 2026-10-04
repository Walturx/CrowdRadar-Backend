/**
 * docs/contratos-streams.md is the hand-off of change 0: per stream, the interfaces it
 * implements, the files it owns and must not touch, the shared ports (reads and writes, with
 * their reviewers) and how to run its tests. It must name every frozen port so no stream
 * starts from a stale list, and every method it names must exist in the referenced file.
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

/** Bullets of the list that follows `encabezado` (a line of the section), continuation lines included. */
function bullets(seccion: string, encabezado: RegExp): string[] {
  const inicio = seccion.search(encabezado);
  if (inicio === -1) return [];
  const resto = seccion.slice(inicio).split('\n').slice(1).join('\n').replace(/^\n/, '');
  const lista = /^((?:- .*\n(?: {2}.*\n)*)+)/.exec(resto)?.[1] ?? '';
  return lista.split(/\n(?=- )/).map((b) => b.trim()).filter(Boolean);
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
    ...archivos('src/facade', /\.ts$/).filter((f) => !f.includes('/impl/')),
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

  it('cada puerto (servicio, fachada, DAO, adaptador, estrategia, observer) declara el patron y el stream duenio en su doc comment', () => {
    for (const ruta of puertos) {
      const fuente = readFileSync(resolve(RAIZ, ruta), 'utf8');
      expect(fuente, ruta).toMatch(/Owner: M[1-6]|Owner: C0/);
      expect(fuente, ruta).toMatch(/Pattern:/);
    }
  });
});

describe('docs/contratos-streams.md: reglas comunes', () => {
  it.each([
    ['como correr las pruebas sin base de datos', /npm test/],
    ['como correr las pruebas con base de datos', /npm run test:db/],
    ['la variable de la base de pruebas', /DATABASE_URL_TEST/],
    ['el runner del contrato DAO contra Sequelize', /ejecutarContratoDAO/],
    ['la plantilla del contrato Sequelize', /plantilla\.sequelize\.contract\.test\.ts\.md/],
    ['la regla del PR de contrato con rama destino y aprobadores', /contract PR[\s\S]*target branch[\s\S]*approv/i],
    ['el nombre exacto buscarUltimoDeUsuarioEnLugar', /`buscarUltimoDeUsuarioEnLugar`/],
    ['agregarPorHora solo por hora (el dia lo agrega el servicio)', /`agregarPorHora`[^\n]*hour/i],
    ['los niveles nullable del evento de saturacion', /SaturacionCambiadaEvento[\s\S]*nullable/i],
    ['que los mappers traducen DTO y entidad', /mappers? own[\s\S]*DTO/i],
  ])('menciona %s', (_titulo, patron) => {
    expect(doc).toMatch(patron);
  });
});

describe.each(['M1', 'M2', 'M3', 'M4', 'M5', 'M6'])('docs/contratos-streams.md: stream %s', (stream) => {
  const seccion = doc.split(/^## /m).find((s) => s.startsWith(`${stream} `)) ?? '';

  it('lista archivos propios, archivos que no debe tocar y como correr sus pruebas', () => {
    expect(seccion).toMatch(/Owned files/);
    expect(seccion).toMatch(/Must not touch/);
    expect(seccion).toMatch(/How to run tests/);
  });

  it('cada interfaz a implementar trae la ruta del archivo del puerto y la de su implementacion', () => {
    const items = bullets(seccion, /^Interfaces to implement:/m);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const rutas = [...item.matchAll(/`([\w/{},]+\.ts)`/g)];
      expect(rutas.length, item).toBeGreaterThanOrEqual(1);
    }
  });

  it('cada puerto compartido nombra revisores, lecturas y escrituras, y esos metodos existen en el archivo', () => {
    const items = bullets(seccion, /^Shared ports/m);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const ruta = /`([\w/]+\.ts)`/.exec(item)?.[1];
      expect(ruta, item).toBeDefined();
      const fuente = readFileSync(resolve(RAIZ, 'src', ruta as string), 'utf8');
      expect(item, ruta).toMatch(/Reviewer/);
      expect(item, ruta).toMatch(/Reads:|Writes:/);
      const nombres = [...item.matchAll(/`([A-Za-z_]\w*)`/g)].map((m) => m[1]);
      for (const nombre of nombres) expect(fuente, `${ruta}: ${nombre}`).toMatch(new RegExp(`\\b${nombre}\\b`));
    }
  });
});

describe('docs/contratos-streams.md: LugarDAO es de M2 por completo', () => {
  const seccion = (stream: string) => doc.split(/^## /m).find((s) => s.startsWith(`${stream} `)) ?? '';

  it('M3 y M4 no tocan LugarDAOSequelize; M3 consume LugarDAO.explorar con un FiltroExploracion', () => {
    for (const stream of ['M3', 'M4']) {
      expect(seccion(stream), stream).toMatch(/Must not touch:[^]*LugarDAOSequelize/);
    }
    expect(seccion('M3')).toMatch(/LugarDAO\.explorar/);
    expect(seccion('M3')).not.toMatch(/filtroExploracion\.ts/);
  });

  it('M2 es dueno de explorar y contarPorCategoria y ya no delega en un modulo de M3', () => {
    expect(seccion('M2')).toMatch(/explorar[^]*contarPorCategoria/);
    expect(seccion('M2')).not.toMatch(/filtroExploracion/);
    expect(readFileSync(resolve(RAIZ, 'src/dao/LugarDAO.ts'), 'utf8')).not.toMatch(/delegates to M3/);
  });
});
