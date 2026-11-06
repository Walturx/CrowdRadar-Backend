/** Mapper: report entities -> response DTOs (spec M4 R1, R7). Fields are listed explicitly, nothing else leaks. */
import { describe, expect, it } from 'vitest';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { ReporteMapper } from '../../src/mapper/ReporteMapper.js';
import { aLugar, aReporte } from '../support/fabrica/datos.js';

const FECHA = new Date('2026-10-05T15:30:00Z');

describe('ReporteMapper', () => {
  describe('aResumen', () => {
    it('lists the report with the place {id, nombre}, ISO date and the points it gives now', () => {
      const reporte = aReporte({
        id: 9,
        usuarioId: 3,
        lugarId: 7,
        nivelSaturacion: NivelSaturacion.SATURADO,
        fechaHora: FECHA,
        nivelConfiabilidad: 80,
      });
      expect(ReporteMapper.aResumen({ reporte, lugarNombre: 'Parque Kennedy', puntos: 10 })).toEqual({
        id: 9,
        lugar: { id: 7, nombre: 'Parque Kennedy' },
        nivel: 'SATURADO',
        fechaHora: '2026-10-05T15:30:00.000Z',
        estado: 'ACTIVO',
        puntos: 10,
      });
    });

    it('carries the estado of a removed report and its 0 points', () => {
      const reporte = aReporte({ estado: EstadoReporte.ELIMINADO });
      expect(ReporteMapper.aResumen({ reporte, lugarNombre: 'Plaza', puntos: 0 })).toEqual(
        expect.objectContaining({ estado: 'ELIMINADO', puntos: 0 }),
      );
    });
  });

  describe('aCreado', () => {
    it('shapes {reporte, saturacionLugar{nivel,actualizadoEn}} and nothing else (no karma block, CRO-72)', () => {
      const lugar = aLugar({
        id: 7,
        saturacionActual: NivelSaturacion.MODERADO,
        saturacionActualizadaEn: FECHA,
      });
      const reporte = aReporte({ id: 4, usuarioId: 3, lugarId: 7, nivelSaturacion: NivelSaturacion.MODERADO, fechaHora: FECHA });
      const dto = ReporteMapper.aCreado({ reporte, lugar });
      expect(dto).toEqual({
        reporte: { id: 4, lugarId: 7, nivel: 'MODERADO', fechaHora: '2026-10-05T15:30:00.000Z' },
        saturacionLugar: { nivel: 'MODERADO', actualizadoEn: '2026-10-05T15:30:00.000Z' },
      });
    });

    it('a place with no reading yet reports a null level and date', () => {
      const lugar = aLugar({ id: 8, saturacionActual: null, saturacionActualizadaEn: null });
      const dto = ReporteMapper.aCreado({ reporte: aReporte({ lugarId: 8 }), lugar });
      expect(dto.saturacionLugar).toEqual({ nivel: null, actualizadoEn: null });
    });
  });

  describe('aPagina', () => {
    it('keeps the page envelope and maps every item', () => {
      const a = aReporte({ id: 1, lugarId: 7 });
      const b = aReporte({ id: 2, lugarId: 8 });
      const dto = ReporteMapper.aPagina({
        items: [
          { reporte: a, lugarNombre: 'A', puntos: 10 },
          { reporte: b, lugarNombre: 'B', puntos: 0 },
        ],
        page: 2,
        size: 2,
        total: 5,
        totalPaginas: 3,
      });
      expect(dto).toMatchObject({ page: 2, size: 2, total: 5, totalPaginas: 3 });
      expect(dto.items.map((i) => [i.id, i.lugar, i.puntos])).toEqual([
        [1, { id: 7, nombre: 'A' }, 10],
        [2, { id: 8, nombre: 'B' }, 0],
      ]);
    });
  });
});
