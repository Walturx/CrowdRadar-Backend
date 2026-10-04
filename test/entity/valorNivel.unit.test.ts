/** One mapping nivel -> number and one rule average -> nivel (R2-1003, R2-1005): strategy, analytics and SQL share them. */
import { describe, expect, it } from 'vitest';
import { SQL_VALOR_NIVEL } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { nivelPorPromedio, VALOR_NIVEL } from '../../src/entity/valorNivel.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';

const UMBRALES = { umbralModerado: 1.67, umbralSaturado: 2.34 };

describe('VALOR_NIVEL', () => {
  it('numera los niveles de 1 a 3 en orden de saturacion', () => {
    expect(VALOR_NIVEL).toEqual({ TRANQUILO: 1, MODERADO: 2, SATURADO: 3 });
  });

  it('cubre todos los niveles del enum', () => {
    expect(Object.keys(VALOR_NIVEL).sort()).toEqual(Object.values(NivelSaturacion).sort());
  });
});

describe('nivelPorPromedio', () => {
  it.each([
    [1, 'TRANQUILO'],
    [1.66, 'TRANQUILO'],
    [1.67, 'MODERADO'],
    [2.33, 'MODERADO'],
    [2.34, 'SATURADO'],
    [3, 'SATURADO'],
  ])('promedio %s -> %s (los umbrales son inclusivos hacia arriba)', (promedio, esperado) => {
    expect(nivelPorPromedio(promedio, UMBRALES)).toBe(esperado);
  });

  it('usa los umbrales recibidos, no unos fijos', () => {
    expect(nivelPorPromedio(2, { umbralModerado: 2.5, umbralSaturado: 2.8 })).toBe('TRANQUILO');
    expect(nivelPorPromedio(2, { umbralModerado: 1.2, umbralSaturado: 1.9 })).toBe('SATURADO');
  });
});

describe('SQL_VALOR_NIVEL (el CASE de agregarPorHora)', () => {
  it('se genera desde VALOR_NIVEL: un WHEN por nivel con su numero', () => {
    for (const [nivel, valor] of Object.entries(VALOR_NIVEL)) expect(SQL_VALOR_NIVEL).toContain(`WHEN '${nivel}' THEN ${valor}`);
    expect(SQL_VALOR_NIVEL.match(/WHEN/g)).toHaveLength(3);
  });
});
