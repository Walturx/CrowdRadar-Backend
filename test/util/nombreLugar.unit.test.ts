/**
 * The one rule that decides how place names are matched and ordered (R3-901, R2-906). LugarDAOSequelize feeds the
 * same two alphabets to `translate()` and LugarDAOMemoria calls `normalizarNombre`, so they cannot drift apart.
 */
import { describe, expect, it } from 'vitest';
import { CON_ACENTO, SIN_ACENTO, compararNombres, normalizarNombre } from '../../src/util/nombreLugar.js';

describe('alfabetos de normalizacion', () => {
  it('CON_ACENTO y SIN_ACENTO tienen el mismo largo (translate() los empareja uno a uno)', () => {
    expect([...CON_ACENTO]).toHaveLength([...SIN_ACENTO].length);
  });

  it('no repiten letras de origen y cada destino es una letra ASCII', () => {
    expect(new Set([...CON_ACENTO]).size).toBe([...CON_ACENTO].length);
    expect(SIN_ACENTO).toMatch(/^[A-Za-z]+$/);
  });
});

describe('normalizarNombre', () => {
  it.each([
    ['Árbol Grande', 'arbol grande'],
    ['ÑANDÚ', 'nandu'],
    ['Plaza 10 (Sur)', 'plaza 10 (sur)'],
    ['Cañón-Çedilla_ü', 'canon-cedilla_u'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(normalizarNombre(entrada)).toBe(esperado);
  });

  it('una letra fuera de la lista se compara tal cual: no se le quita el acento ni se le baja la mayuscula', () => {
    expect(normalizarNombre('Łódź')).toBe('Łodź');
    expect(normalizarNombre('łódź')).toBe('łodź');
  });
});

describe('compararNombres', () => {
  it('ordena por punto de codigo: espacio, signos, digitos y guion bajo antes que las letras', () => {
    const ordenados = ['plaza_sur', 'plaza-norte', 'plaza norte', 'plaza 2', 'plaza 10', 'plaza (sur)'].sort(compararNombres);
    expect(ordenados).toEqual(['plaza (sur)', 'plaza 10', 'plaza 2', 'plaza norte', 'plaza-norte', 'plaza_sur']);
  });

  it('compara por bytes UTF-8, igual que COLLATE "C": un caracter astral va despues de uno BMP', () => {
    expect(['😀', '￿'].sort(compararNombres)).toEqual(['￿', '😀']);
  });
});
