/**
 * Guard of the shared module graph (vitest.config.ts runs most files with `isolate: false`): a test file that resets
 * or mocks modules, stubs env vars or writes `process.env` changes state the next file of the same worker sees, so it
 * must be listed in ARCHIVOS_AISLADOS. This scans every test file and fails with the ones that are missing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHIVOS_AISLADOS } from './archivosAislados.js';

const RAIZ = join(import.meta.dirname, '..', '..');

/** Module/env tampering that leaks across files of a worker when the module graph is shared. */
const PATRONES_AISLAMIENTO: [string, RegExp][] = [
  ['vi.resetModules', /\bvi\.resetModules\s*\(/],
  ['vi.stubEnv', /\bvi\.stubEnv\s*\(/],
  ['vi.mock', /\bvi\.mock\s*\(/],
  ['vi.doMock', /\bvi\.doMock\s*\(/],
  ['process.env = / process.env.X =', /\bprocess\.env(\s*|\.\w+\s*|\[[^\]]+\]\s*)=(?!=)/],
  ['delete process.env', /\bdelete\s+process\.env\b/],
  ['Object.assign(process.env', /Object\.assign\(\s*process\.env\b/],
];

function archivosDePrueba(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) return archivosDePrueba(ruta);
    return entrada.name.endsWith('.test.ts') ? [relative(RAIZ, ruta).split(sep).join('/')] : [];
  });
}

/** Names of the patterns the source matches. */
export function patronesDeAislamiento(fuente: string): string[] {
  return PATRONES_AISLAMIENTO.filter(([, patron]) => patron.test(fuente)).map(([nombre]) => nombre);
}

describe('aislamiento de modulos en las pruebas', () => {
  it('los patrones detectan cada forma de tocar modulos o el entorno (y no una comparacion)', () => {
    expect(patronesDeAislamiento("vi.mock('x')")).toEqual(['vi.mock']);
    expect(patronesDeAislamiento('vi.doMock("x", f)')).toEqual(['vi.doMock']);
    expect(patronesDeAislamiento('vi.resetModules();')).toEqual(['vi.resetModules']);
    expect(patronesDeAislamiento("vi.stubEnv('A', 'b')")).toEqual(['vi.stubEnv']);
    expect(patronesDeAislamiento('process.env.PORT = "1"')).toEqual(['process.env = / process.env.X =']);
    expect(patronesDeAislamiento("process.env['PORT'] = '1'")).toEqual(['process.env = / process.env.X =']);
    expect(patronesDeAislamiento('process.env = anterior')).toEqual(['process.env = / process.env.X =']);
    expect(patronesDeAislamiento('delete process.env.PORT')).toEqual(['delete process.env']);
    expect(patronesDeAislamiento('Object.assign(process.env, x)')).toEqual(['Object.assign(process.env']);
    expect(patronesDeAislamiento("if (process.env.CI === 'true') {}")).toEqual([]);
    expect(patronesDeAislamiento('const url = process.env.DATABASE_URL_TEST;')).toEqual([]);
  });

  it('todo archivo de prueba que toca modulos o process.env esta en ARCHIVOS_AISLADOS', () => {
    const aislados = new Set(ARCHIVOS_AISLADOS);
    const faltantes = archivosDePrueba(join(RAIZ, 'test'))
      .filter((archivo) => archivo !== 'test/support/aislamiento.guard.test.ts')
      .map((archivo) => [archivo, patronesDeAislamiento(readFileSync(join(RAIZ, archivo), 'utf8'))] as const)
      .filter(([archivo, patrones]) => patrones.length > 0 && !aislados.has(archivo));
    expect(faltantes).toEqual([]);
  });

  it('cada archivo listado existe (una entrada vieja no aisla nada)', () => {
    const existentes = new Set(archivosDePrueba(join(RAIZ, 'test')));
    expect(ARCHIVOS_AISLADOS.filter((archivo) => !existentes.has(archivo))).toEqual([]);
  });
});
