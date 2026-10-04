/** Unit tests of SaturacionUltimoReporteStrategy: level of the latest ACTIVO report inside the window (spec M4 R5). */
import { describe, expect, it } from 'vitest';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { SaturacionUltimoReporteStrategy } from '../../src/pattern/strategy/saturacion/impl/SaturacionUltimoReporteStrategy.js';
import { aReporte } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000);
const estrategia = new SaturacionUltimoReporteStrategy({ ventanaMin: 60 });

describe('SaturacionUltimoReporteStrategy', () => {
  it('devuelve el nivel del reporte ACTIVO mas reciente de la ventana', () => {
    const reportes = [
      aReporte({ nivelSaturacion: NivelSaturacion.TRANQUILO, fechaHora: hace(30) }),
      aReporte({ nivelSaturacion: NivelSaturacion.SATURADO, fechaHora: hace(5) }),
      aReporte({ nivelSaturacion: NivelSaturacion.MODERADO, fechaHora: hace(50) }),
    ];
    expect(estrategia.calcular(reportes, AHORA)).toBe(NivelSaturacion.SATURADO);
  });

  it('ignora ELIMINADO, futuros y fuera de ventana', () => {
    const reportes = [
      aReporte({ nivelSaturacion: NivelSaturacion.SATURADO, fechaHora: hace(1), estado: EstadoReporte.ELIMINADO }),
      aReporte({ nivelSaturacion: NivelSaturacion.SATURADO, fechaHora: hace(-5) }),
      aReporte({ nivelSaturacion: NivelSaturacion.SATURADO, fechaHora: hace(60) }),
      aReporte({ nivelSaturacion: NivelSaturacion.TRANQUILO, fechaHora: hace(59) }),
    ];
    expect(estrategia.calcular(reportes, AHORA)).toBe(NivelSaturacion.TRANQUILO);
  });

  it('sin reportes validos devuelve null', () => {
    const reportes = [aReporte({ nivelSaturacion: NivelSaturacion.SATURADO, fechaHora: hace(90) })];
    expect(estrategia.calcular(reportes, AHORA)).toBeNull();
    expect(estrategia.calcular([], AHORA)).toBeNull();
  });
});
