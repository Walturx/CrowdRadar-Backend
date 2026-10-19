/**
 * Naming and layout conventions documented in the README (R2-401, R2-404, R2-405, R2-407):
 * the rules are checked here so they cannot drift back.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(import.meta.dirname, '..', '..');

/** Every file under `carpeta` (relative to the repo root), as repo-relative POSIX paths. */
function archivos(carpeta: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(resolve(RAIZ, carpeta), { withFileTypes: true })) {
    const ruta = `${carpeta}/${entrada.name}`;
    if (entrada.isDirectory()) salida.push(...archivos(ruta));
    else salida.push(ruta);
  }
  return salida;
}

describe('convenciones de nombres', () => {
  it('todo archivo de prueba lleva el tipo en el nombre: .unit, .api, .contract, .whitebox o .blackbox', () => {
    const sinTipo = archivos('test').filter((ruta) => ruta.endsWith('.test.ts') && !/\.(unit|api|contract|whitebox|blackbox)\.test\.ts$/.test(ruta));
    expect(sinTipo).toEqual([]);
  });

  it('los archivos de evidencia por flujo usan el tipo directo: X.whitebox.test.ts o X.blackbox.test.ts (R2-1010)', () => {
    const mezclados = archivos('test').filter((ruta) => /\.(whitebox|blackbox)\.(unit|api|contract)\.test\.ts$/.test(ruta));
    expect(mezclados).toEqual(['test/favoritoAlerta/AlertaFavoritosObserver.whitebox.unit.test.ts']);
  });

  it('los adaptadores concretos (adapter/**/impl) terminan en Adapter (R2-401)', () => {
    const impls = archivos('src/adapter').filter((ruta) => ruta.includes('/impl/'));
    expect(impls.length).toBeGreaterThan(0);
    expect(impls.filter((ruta) => !ruta.endsWith('Adapter.ts'))).toEqual([]);
  });

  it('los puertos de adapter/ conservan su nombre', () => {
    for (const puerto of ['Hasher', 'EmisorToken', 'GeneradorToken', 'EnviadorCorreo', 'NotificadorPush']) {
      expect(archivos('src/adapter').some((ruta) => ruta.endsWith(`/${puerto}.ts`)), puerto).toBe(true);
    }
  });

  it('los modulos de route/ son <recurso>.routes.ts o ayudantes en camelCase singular (R2-407)', () => {
    expect(existsSync(resolve(RAIZ, 'src/route/middlewareRuta.ts'))).toBe(true);
    expect(existsSync(resolve(RAIZ, 'src/route/middlewaresRuta.ts'))).toBe(false);
    const raros = archivos('src/route').filter((ruta) => !/\/([a-z]+\.routes|middlewareRuta)\.ts$/.test(ruta));
    expect(raros).toEqual([]);
  });

  it('container/ usa un archivo en minusculas por flujo, mas Contenedor.ts', () => {
    const raros = archivos('src/container').filter((ruta) => !/\/([a-z][A-Za-z]*|Contenedor)\.ts$/.test(ruta));
    expect(raros).toEqual([]);
  });
});

describe('Paginacion en un solo modulo (R2-404)', () => {
  it('tipos y ayudantes viven juntos en dao/Paginacion.ts y util/paginacion.ts ya no existe', () => {
    expect(existsSync(resolve(RAIZ, 'src/util/paginacion.ts'))).toBe(false);
    const modulo = readFileSync(resolve(RAIZ, 'src/dao/Paginacion.ts'), 'utf8');
    for (const simbolo of ['interface Paginacion', 'interface Pagina<', 'armarPagina', 'desplazamiento']) {
      expect(modulo).toContain(simbolo);
    }
  });
});

describe('README documenta las convenciones (R2-405)', () => {
  const readme = readFileSync(join(RAIZ, 'README.md'), 'utf8');

  it.each(['File naming', 'PascalCase', '*.routes.ts', 'container/<stream>.ts', '.unit', '.api', '.contract', '.whitebox', '.blackbox', 'Adapter'])(
    'menciona "%s"',
    (termino) => {
      expect(readme).toContain(termino);
    },
  );
});
