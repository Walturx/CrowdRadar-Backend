/**
 * .env.example documents every key and is SAFE: its placeholders fail validation until replaced,
 * so a copied-and-forgotten example can never boot with a known secret (review R1-207; spec A12.1).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esquemaEntorno, validarEntorno } from '../../src/config/esquemaEntorno.js';

const RAIZ = resolve(import.meta.dirname, '..', '..');

function leerEjemplo(): Record<string, string> {
  const entorno: Record<string, string> = {};
  for (const linea of readFileSync(resolve(RAIZ, '.env.example'), 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(linea);
    if (coincidencia) entorno[coincidencia[1] as string] = coincidencia[2] as string;
  }
  return entorno;
}

/** Keys documented as a commented line (`# KEY=value`): optional settings that must stay unset by default. */
function leerComentadas(): string[] {
  return readFileSync(resolve(RAIZ, '.env.example'), 'utf8')
    .split(/\r?\n/)
    .flatMap((linea) => /^#\s*([A-Z][A-Z0-9_]*)=/.exec(linea)?.[1] ?? []);
}

describe('.env.example', () => {
  const ejemplo = leerEjemplo();

  it('lista TODAS las claves que lee el esquema', () => {
    const comentadas = leerComentadas();
    const faltantes = Object.keys(esquemaEntorno.shape).filter((clave) => !(clave in ejemplo) && !comentadas.includes(clave));
    expect(faltantes).toEqual([]);
  });

  it('no valida tal cual: DB_PASSWORD, JWT_SECRETO y ADMIN_PASSWORD son placeholders que hay que reemplazar', () => {
    const resultado = validarEntorno(ejemplo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.claves).toEqual(['ADMIN_PASSWORD', 'DB_PASSWORD', 'JWT_SECRETO']);
  });

  it('con esos tres valores reemplazados el resto de valores de ejemplo son validos', () => {
    const resultado = validarEntorno({
      ...ejemplo,
      DB_PASSWORD: 'una-clave-local-real',
      JWT_SECRETO: 'x'.repeat(48),
      ADMIN_PASSWORD: 'UnaClaveDeAdmin123',
    });
    expect(resultado.ok).toBe(true);
  });

  it('los placeholders empiezan con CAMBIAR', () => {
    for (const clave of ['DB_PASSWORD', 'JWT_SECRETO', 'ADMIN_PASSWORD']) {
      expect(ejemplo[clave]).toMatch(/^CAMBIAR/);
    }
  });
});
