/**
 * Integrante: stream M4 (reportes y karma)
 * Tecnica: caja blanca (cobertura de decisiones y condiciones, valores limite)
 * Metodo: SaturacionPonderadaStrategy.calcular (spec M4 R5, S11-S14)
 * CC: 8 = 1 + for + if(estado ELIMINADO) + if(edad < 0 || edad >= ventana: 2 condiciones) + if(validos < minimo)
 *     + if(promedio < umbralModerado) + if(promedio < umbralSaturado)
 * Cada caso nombra el camino o el valor limite que cubre.
 */
import { describe, expect, it } from 'vitest';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { SaturacionPonderadaStrategy } from '../../src/pattern/strategy/saturacion/impl/SaturacionPonderadaStrategy.js';
import { aReporte } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const VENTANA_MIN = 60;
const hace = (minutos: number, segundos = 0) => new Date(AHORA.getTime() - (minutos * 60 + segundos) * 1000);
const reporte = (nivel: NivelSaturacion, fechaHora: Date = AHORA, estado: EstadoReporte = EstadoReporte.ACTIVO) =>
  aReporte({ nivelSaturacion: nivel, fechaHora, estado });
const repetir = (nivel: NivelSaturacion, veces: number, fechaHora: Date = AHORA) =>
  Array.from({ length: veces }, () => reporte(nivel, fechaHora));

const { TRANQUILO, MODERADO, SATURADO } = NivelSaturacion;
const crear = (opciones = {}) =>
  new SaturacionPonderadaStrategy({
    ventanaMin: VENTANA_MIN,
    minReportes: 3,
    umbralModerado: 1.67,
    umbralSaturado: 2.34,
    ...opciones,
  });

describe('SaturacionPonderadaStrategy.calcular (caja blanca)', () => {
  describe('cantidad minima de reportes validos', () => {
    it('sin reportes devuelve null', () => {
      expect(crear().calcular([], AHORA)).toBeNull();
    });

    it('2 reportes (menos que el minimo) devuelve null aunque sean SATURADO', () => {
      expect(crear().calcular(repetir(SATURADO, 2), AHORA)).toBeNull();
    });

    it('exactamente 3 reportes calcula el nivel', () => {
      expect(crear().calcular(repetir(SATURADO, 3), AHORA)).toBe(SATURADO);
    });

    it('el minimo es configurable', () => {
      expect(crear({ minReportes: 2 }).calcular(repetir(TRANQUILO, 2), AHORA)).toBe(TRANQUILO);
    });
  });

  describe('ventana de tiempo', () => {
    it('edad 0 (recien creado) entra con peso 1', () => {
      expect(crear().calcular(repetir(MODERADO, 3, AHORA), AHORA)).toBe(MODERADO);
    });

    it('edad = ventana se descarta: 2 recientes + 1 de 60:00 dejan solo 2 validos', () => {
      const reportes = [...repetir(SATURADO, 2), reporte(SATURADO, hace(60))];
      expect(crear().calcular(reportes, AHORA)).toBeNull();
    });

    it('edad 59:59 todavia entra: 2 recientes + 1 de 59:59 son 3 validos', () => {
      const reportes = [...repetir(SATURADO, 2), reporte(SATURADO, hace(59, 59))];
      expect(crear().calcular(reportes, AHORA)).toBe(SATURADO);
    });

    it('un reporte futuro se descarta (reloj adelantado)', () => {
      const reportes = [...repetir(SATURADO, 2), reporte(SATURADO, new Date(AHORA.getTime() + 1000))];
      expect(crear().calcular(reportes, AHORA)).toBeNull();
    });

    it('la ventana es configurable (30 min descarta un reporte de 45 min)', () => {
      const reportes = [...repetir(SATURADO, 2), reporte(SATURADO, hace(45))];
      expect(crear({ ventanaMin: 30 }).calcular(reportes, AHORA)).toBeNull();
      expect(crear({ ventanaMin: 60 }).calcular(reportes, AHORA)).toBe(SATURADO);
    });
  });

  describe('estado del reporte', () => {
    it('un reporte ELIMINADO no cuenta para el minimo', () => {
      const reportes = [...repetir(SATURADO, 2), reporte(SATURADO, AHORA, EstadoReporte.ELIMINADO)];
      expect(crear().calcular(reportes, AHORA)).toBeNull();
    });

    it('un reporte ELIMINADO no mueve el promedio', () => {
      const eliminados = Array.from({ length: 5 }, () => reporte(SATURADO, AHORA, EstadoReporte.ELIMINADO));
      expect(crear().calcular([...repetir(TRANQUILO, 3), ...eliminados], AHORA)).toBe(TRANQUILO);
    });
  });

  describe('pesos por antiguedad (w = 1 - edad/ventana)', () => {
    it('los recientes pesan mas: 3 SATURADO nuevos vencen a 2 TRANQUILO de 54 min', () => {
      const reportes = [...repetir(SATURADO, 3), ...repetir(TRANQUILO, 2, hace(54))];
      // ponderado: (3*3 + 2*0.1*1) / (3 + 2*0.1) = 2.875 -> SATURADO; sin pesos seria 2.2 -> MODERADO
      expect(crear().calcular(reportes, AHORA)).toBe(SATURADO);
    });

    it('los antiguos pesan menos: 3 TRANQUILO nuevos vencen a 2 SATURADO de 54 min', () => {
      const reportes = [...repetir(TRANQUILO, 3), ...repetir(SATURADO, 2, hace(54))];
      // ponderado: (3*1 + 2*0.1*3) / 3.2 = 1.125 -> TRANQUILO; sin pesos seria 1.8 -> MODERADO
      expect(crear().calcular(reportes, AHORA)).toBe(TRANQUILO);
    });
  });

  describe('umbrales (promedio < 1.67 TRANQUILO, < 2.34 MODERADO, resto SATURADO)', () => {
    // 100 reportes recientes con peso 1: el promedio es exacto en centesimas.
    const promedio = (tranquilos: number, moderados: number, saturados: number) =>
      crear().calcular(
        [...repetir(TRANQUILO, tranquilos), ...repetir(MODERADO, moderados), ...repetir(SATURADO, saturados)],
        AHORA,
      );

    it('1.66 es TRANQUILO', () => expect(promedio(34, 66, 0)).toBe(TRANQUILO));
    it('1.67 es MODERADO (el limite pertenece al nivel superior)', () => expect(promedio(33, 67, 0)).toBe(MODERADO));
    it('2.33 es MODERADO', () => expect(promedio(0, 67, 33)).toBe(MODERADO));
    it('2.34 es SATURADO (el limite pertenece al nivel superior)', () => expect(promedio(0, 66, 34)).toBe(SATURADO));
    it('un conjunto de un solo nivel devuelve ese nivel', () => {
      expect(promedio(5, 0, 0)).toBe(TRANQUILO);
      expect(promedio(0, 5, 0)).toBe(MODERADO);
      expect(promedio(0, 0, 5)).toBe(SATURADO);
    });
  });
});
