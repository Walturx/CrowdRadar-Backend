/** CONFIABILIDAD_MIN_VOTOS_ESTADO (M5): votes a report needs before it can be VALIDADO or RECHAZADO. */
import { describe, expect, it } from 'vitest';
import { validarEntorno } from '../../src/config/esquemaEntorno.js';
import { configPrueba } from '../support/configPrueba.js';

const base = { DB_PASSWORD: 'clave-bd', JWT_SECRETO: 'j'.repeat(40) };

describe('CONFIABILIDAD_MIN_VOTOS_ESTADO', () => {
  it('vale 10 por defecto y se sobrescribe desde el entorno', () => {
    expect(configPrueba().reglas.confiabilidadMinVotosEstado).toBe(10);
    expect(configPrueba({ CONFIABILIDAD_MIN_VOTOS_ESTADO: 4 }).reglas.confiabilidadMinVotosEstado).toBe(4);
  });

  it('rechaza 0 y valores no numericos', () => {
    const claves = (valor: string) => {
      const r = validarEntorno({ ...base, CONFIABILIDAD_MIN_VOTOS_ESTADO: valor });
      return r.ok ? [] : r.claves;
    };
    expect(claves('0')).toEqual(['CONFIABILIDAD_MIN_VOTOS_ESTADO']);
    expect(claves('muchos')).toEqual(['CONFIABILIDAD_MIN_VOTOS_ESTADO']);
    expect(claves('1')).toEqual([]);
  });
});
