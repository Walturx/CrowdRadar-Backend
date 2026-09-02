/**
 * Docs stay in sync with the code (spec A10.3, A12.3): docs/api-contract.md names every frozen
 * route and error code; the README documents the layout, the layering rule, the pattern map and every env key.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esquemaEntorno } from '../../src/config/esquemaEntorno.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { TABLA_RUTAS } from '../route/tablaRutas.js';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), 'utf8');

/** `/api/lugares/12/historial?token=abc` -> regex over a doc row `| GET | /api/lugares/:id/historial |`. */
function filaDeDocumentacion(metodo: string, ruta: string): RegExp {
  const patron = ruta
    .split('?')[0]!
    .split('/')
    .map((segmento) => (/^(\d+|token-fcm)$/.test(segmento) ? ':[A-Za-z]+' : segmento))
    .join('/');
  return new RegExp(`\\|\\s*${metodo.toUpperCase()}\\s*\\|\\s*${patron}\\s*\\|`);
}

describe('docs/api-contract.md', () => {
  const contrato = leer('docs/api-contract.md');

  it.each(TABLA_RUTAS)('documenta $metodo $ruta', ({ metodo, ruta }) => {
    expect(contrato).toMatch(filaDeDocumentacion(metodo, ruta));
  });

  it.each([
    ['POST', '/api/auth/register'],
    ['POST', '/api/auth/login'],
    ['GET', '/api/users/profile'],
    ['PUT', '/api/users/profile'],
    ['PUT', '/api/users/password'],
    ['GET', '/'],
    ['GET', '/api/salud'],
  ])('documenta la ruta implementada %s %s', (metodo, ruta) => {
    expect(contrato).toMatch(filaDeDocumentacion(metodo, ruta));
  });

  it('documenta todos los codigos de error congelados', () => {
    const sinDocumentar = Object.values(CodigoError).filter((codigo) => !contrato.includes(codigo));
    expect(sinDocumentar).toEqual([]);
  });

  it('documenta los sobres de exito y error y el requestId del 500', () => {
    for (const texto of ['"message"', '"data"', '"code"', '"errors"', 'requestId']) expect(contrato).toContain(texto);
  });
});

describe('README.md', () => {
  const readme = leer('README.md');

  it('documenta todas las variables de entorno del esquema', () => {
    const sinDocumentar = Object.keys(esquemaEntorno.shape).filter((clave) => !readme.includes(`\`${clave}\``));
    expect(sinDocumentar).toEqual([]);
  });

  it.each([
    'Project layout',
    'Layering rule',
    'Pattern map',
    'Environment variables',
    'Run',
    'Migrate',
    'Test',
    'test:db',
    'DATABASE_URL_TEST',
  ])('tiene la seccion o termino "%s"', (termino) => {
    expect(readme).toContain(termino);
  });

  it.each(['Singleton', 'Factory Method', 'DAO', 'Adapter', 'Mapper', 'Service Layer', 'Facade', 'composition root'])(
    'el mapa de patrones incluye %s',
    (patron) => {
      expect(readme).toContain(patron);
    },
  );

  it('explica las carpetas que no siguen el patron de capa (datasource, enum, types)', () => {
    for (const carpeta of ['datasource/', 'enum/', 'types/']) expect(readme).toContain(carpeta);
  });
});
