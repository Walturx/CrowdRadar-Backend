/**
 * SEED_SINTETICO (synthetic demo history): unset it follows NODE_ENV; an explicit `true` is refused in production,
 * so demo users and reports cannot be switched on there by a stray variable. .env.example leaves it unset.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validarEntorno } from '../../src/config/esquemaEntorno.js';
import { configPrueba } from '../support/configPrueba.js';

const base = { DB_PASSWORD: 'clave-bd', JWT_SECRETO: 'j'.repeat(40) };
const claves = (env: Record<string, string>) => {
  const r = validarEntorno({ ...base, ...env });
  return r.ok ? [] : r.claves;
};

describe('SEED_SINTETICO en el esquema de entorno', () => {
  it('SEED_SINTETICO=true con NODE_ENV=production se rechaza nombrando la clave', () => {
    const r = validarEntorno({ ...base, NODE_ENV: 'production', SEED_SINTETICO: 'true' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.claves).toEqual(['SEED_SINTETICO']);
      expect(r.mensaje).toContain('production');
    }
  });

  it.each([
    ['production sin la variable', { NODE_ENV: 'production' }],
    ['production con false', { NODE_ENV: 'production', SEED_SINTETICO: 'false' }],
    ['development con true', { NODE_ENV: 'development', SEED_SINTETICO: 'true' }],
    ['development con false', { NODE_ENV: 'development', SEED_SINTETICO: 'false' }],
    ['test sin la variable', { NODE_ENV: 'test' }],
  ])('se acepta: %s', (_caso, env) => {
    expect(claves(env)).toEqual([]);
  });

  it('la configuracion sigue a NODE_ENV cuando no se define y el valor explicito manda fuera de produccion', () => {
    expect(configPrueba({ NODE_ENV: 'development' }).semillas.sinteticos).toBe(true);
    expect(configPrueba({ NODE_ENV: 'production' }).semillas.sinteticos).toBe(false);
    expect(configPrueba({ NODE_ENV: 'development', SEED_SINTETICO: 'false' }).semillas.sinteticos).toBe(false);
  });
});

describe('.env.example y SEED_SINTETICO', () => {
  const ejemplo = readFileSync(resolve(import.meta.dirname, '..', '..', '.env.example'), 'utf8').split(/\r?\n/);

  it('la variable no esta activa: una copia del ejemplo no enciende el historial sintetico en produccion', () => {
    expect(ejemplo.filter((linea) => /^SEED_SINTETICO=/.test(linea))).toEqual([]);
  });

  it('queda documentada comentada, con la explicacion de su valor por defecto', () => {
    const indice = ejemplo.findIndex((linea) => /^#\s*SEED_SINTETICO=/.test(linea));
    expect(indice).toBeGreaterThan(0);
    expect(ejemplo[indice - 1]).toMatch(/Unset|production/i);
  });
});
