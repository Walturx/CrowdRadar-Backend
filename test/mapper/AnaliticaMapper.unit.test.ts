/** Mapper: analytics results -> the DTOs the app parses (spec M4 R11-R14). Messages and the summary text live here. */
import { describe, expect, it } from 'vitest';
import { FiltroDias } from '../../src/enum/FiltroDias.js';
import { AnaliticaMapper } from '../../src/mapper/AnaliticaMapper.js';
import type { ResultadoComparacion } from '../../src/service/AnaliticaService.js';

const horas = (valores: Record<number, number>) =>
  Array.from({ length: 24 }, (_, hora) => ({ hora, valor: valores[hora] ?? 0, muestras: valores[hora] ? 5 : 0 }));

const comparacion = (extra: Partial<ResultadoComparacion> = {}): ResultadoComparacion => ({
  suficiente: true,
  sintetico: false,
  periodoA: horas({ 12: 1 }),
  periodoB: horas({ 12: 3 }),
  diferencias: [{ hora: 12, diferencia: 2 }],
  bandaMayorAfluencia: { horaInicio: 11, horaFin: 13 },
  diasB: FiltroDias.FIN_DE_SEMANA,
  ...extra,
});

describe('AnaliticaMapper', () => {
  describe('aHistorial', () => {
    it('con datos: puntos, hayDatos y sintetico, sin mensaje', () => {
      const puntos = [{ etiqueta: '09:00', valor: 2.5, muestras: 2 }];
      expect(AnaliticaMapper.aHistorial({ hayDatos: true, sintetico: true, puntos })).toEqual({
        puntos,
        hayDatos: true,
        mensaje: null,
        sintetico: true,
      });
    });

    it('sin datos: hayDatos=false con el mensaje de historial vacio', () => {
      expect(AnaliticaMapper.aHistorial({ hayDatos: false, sintetico: false, puntos: [] })).toEqual({
        puntos: [],
        hayDatos: false,
        mensaje: 'No existe información histórica disponible para este lugar.',
        sintetico: false,
      });
    });
  });

  describe('aComparacion', () => {
    it('nombra la banda con el sujeto del periodo B', () => {
      const dto = AnaliticaMapper.aComparacion(comparacion());
      expect(dto.resumen).toBe('Los fines de semana la afluencia sube entre 11:00 y 13:00.');
      expect(dto).toMatchObject({ suficiente: true, mensaje: null, sintetico: false });
      expect(dto.periodoB[12]).toEqual({ hora: 12, valor: 3, muestras: 5 });
      expect(dto.diferencias).toEqual([{ hora: 12, diferencia: 2 }]);
    });

    it.each([
      [FiltroDias.LABORABLES, 'Los días laborables la afluencia sube entre 11:00 y 13:00.'],
      [FiltroDias.TODOS, 'En el periodo B la afluencia sube entre 11:00 y 13:00.'],
    ])('el sujeto depende de los dias de B (%s)', (diasB, esperado) => {
      expect(AnaliticaMapper.aComparacion(comparacion({ diasB })).resumen).toBe(esperado);
    });

    it('la banda que llega a la medianoche cierra en 00:00', () => {
      const dto = AnaliticaMapper.aComparacion(comparacion({ bandaMayorAfluencia: { horaInicio: 22, horaFin: 24 } }));
      expect(dto.resumen).toBe('Los fines de semana la afluencia sube entre 22:00 y 00:00.');
    });

    it('sin banda: no hay diferencias notables', () => {
      const dto = AnaliticaMapper.aComparacion(comparacion({ bandaMayorAfluencia: null }));
      expect(dto.resumen).toBe('No hay diferencias notables entre ambos periodos.');
    });

    it('datos insuficientes: suficiente=false, mensaje y sin resumen ni diferencias', () => {
      const dto = AnaliticaMapper.aComparacion(comparacion({ suficiente: false, diferencias: [], bandaMayorAfluencia: null }));
      expect(dto).toMatchObject({
        suficiente: false,
        resumen: null,
        diferencias: [],
        mensaje: 'No existen datos suficientes para realizar la comparación.',
      });
    });
  });
});
