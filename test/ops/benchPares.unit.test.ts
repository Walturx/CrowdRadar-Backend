/** Pair order of the POST /api/reportes bench scenario (scripts/bench/run.mjs). */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without type declarations
import { parReporte } from '../../scripts/bench/run.mjs';

const USUARIOS = 100;
const LUGARES = 200;
type Par = { usuario: number; lugar: number };
const pares = (unUsuario: boolean): Par[] =>
  Array.from({ length: USUARIOS * LUGARES }, (_, i) => parReporte(i, USUARIOS, LUGARES, unUsuario) as Par);

describe('bench: pares (usuario, lugar) de POST /api/reportes', () => {
  it.each([false, true])('los 20000 pares son distintos (unUsuario=%s): el cooldown no se alcanza', (unUsuario) => {
    expect(new Set(pares(unUsuario).map((p) => `${p.usuario}/${p.lugar}`)).size).toBe(USUARIOS * LUGARES);
  });

  it('por defecto 50 peticiones seguidas son de 50 usuarios y 50 lugares distintos', () => {
    const ventana = pares(false).slice(1234, 1284);
    expect(new Set(ventana.map((p) => p.usuario)).size).toBe(50);
    expect(new Set(ventana.map((p) => p.lugar)).size).toBe(50);
  });

  it('--reportes-un-usuario reproduce la linea base: 200 peticiones seguidas del mismo usuario', () => {
    expect(new Set(pares(true).slice(0, 200).map((p) => p.usuario))).toEqual(new Set([0]));
  });
});
