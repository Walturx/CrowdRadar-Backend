/** Mapper: report entities -> response DTOs (spec M4 R1, R7). Fields are listed explicitly, nothing else leaks. */
import { describe, expect, it } from 'vitest';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { MotivoSinPuntos } from '../../src/enum/MotivoSinPuntos.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { ReporteMapper } from '../../src/mapper/ReporteMapper.js';
import { aLugar, aReporte } from '../support/fabrica/datos.js';

const FECHA = new Date('2026-10-05T15:30:00Z');

describe('ReporteMapper', () => {
  describe('aResumen', () => {
    it('lists the report with the place {id, nombre}, ISO date and the points it earned', () => {
      const reporte = aReporte({
        id: 9,
        usuarioId: 3,
        lugarId: 7,
        nivelSaturacion: NivelSaturacion.SATURADO,
        fechaHora: FECHA,
        puntosOtorgados: 10,
        nivelConfiabilidad: 80,
      });
      expect(ReporteMapper.aResumen(reporte, 'Parque Kennedy')).toEqual({
        id: 9,
        lugar: { id: 7, nombre: 'Parque Kennedy' },
        nivel: 'SATURADO',
        fechaHora: '2026-10-05T15:30:00.000Z',
        estado: 'ACTIVO',
        puntosOtorgados: 10,
        motivoSinPuntos: null,
      });
    });

    it('carries the reason when no points were given and the estado of a removed report', () => {
      const reporte = aReporte({
        estado: EstadoReporte.ELIMINADO,
        puntosOtorgados: 0,
        motivoSinPuntos: MotivoSinPuntos.TOPE_DIARIO,
      });
      expect(ReporteMapper.aResumen(reporte, 'Plaza')).toMatchObject({
        estado: 'ELIMINADO',
        puntosOtorgados: 0,
        motivoSinPuntos: 'TOPE_DIARIO',
      });
    });
  });

  describe('aCreado', () => {
    it('shapes {reporte, karma{puntosGanados,total,motivoSinPuntos}, saturacionLugar{nivel,actualizadoEn}}', () => {
      const lugar = aLugar({
        id: 7,
        saturacionActual: NivelSaturacion.MODERADO,
        saturacionActualizadaEn: FECHA,
      });
      const reporte = aReporte({ id: 4, usuarioId: 3, lugarId: 7, nivelSaturacion: NivelSaturacion.MODERADO, fechaHora: FECHA });
      const dto = ReporteMapper.aCreado({
        reporte,
        karma: { puntosGanados: 10, total: 140, motivoSinPuntos: null },
        lugar,
      });
      expect(dto).toEqual({
        reporte: { id: 4, lugarId: 7, nivel: 'MODERADO', fechaHora: '2026-10-05T15:30:00.000Z' },
        karma: { puntosGanados: 10, total: 140, motivoSinPuntos: null },
        saturacionLugar: { nivel: 'MODERADO', actualizadoEn: '2026-10-05T15:30:00.000Z' },
      });
    });

    it('a place with no reading yet reports a null level and date', () => {
      const lugar = aLugar({ id: 8, saturacionActual: null, saturacionActualizadaEn: null });
      const dto = ReporteMapper.aCreado({
        reporte: aReporte({ lugarId: 8 }),
        karma: { puntosGanados: 0, total: 50, motivoSinPuntos: MotivoSinPuntos.TOPE_DIARIO },
        lugar,
      });
      expect(dto.karma).toEqual({ puntosGanados: 0, total: 50, motivoSinPuntos: 'TOPE_DIARIO' });
      expect(dto.saturacionLugar).toEqual({ nivel: null, actualizadoEn: null });
    });
  });

  describe('aPagina', () => {
    it('keeps the page envelope and maps every item', () => {
      const a = aReporte({ id: 1, lugarId: 7 });
      const b = aReporte({ id: 2, lugarId: 8 });
      const dto = ReporteMapper.aPagina({
        items: [
          { reporte: a, lugarNombre: 'A' },
          { reporte: b, lugarNombre: 'B' },
        ],
        page: 2,
        size: 2,
        total: 5,
        totalPaginas: 3,
      });
      expect(dto).toMatchObject({ page: 2, size: 2, total: 5, totalPaginas: 3 });
      expect(dto.items.map((i) => [i.id, i.lugar])).toEqual([
        [1, { id: 7, nombre: 'A' }],
        [2, { id: 8, nombre: 'B' }],
      ]);
    });
  });
});
