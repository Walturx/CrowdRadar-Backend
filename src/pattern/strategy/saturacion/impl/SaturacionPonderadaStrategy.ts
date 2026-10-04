import type { ReporteSaturacion } from '../../../../entity/ReporteSaturacion.js';
import { nivelPorPromedio, VALOR_NIVEL } from '../../../../entity/valorNivel.js';
import { EstadoReporte } from '../../../../enum/EstadoReporte.js';
import type { NivelSaturacion } from '../../../../enum/NivelSaturacion.js';
import { MS_POR_MINUTO } from '../../../../util/tiempo.js';
import type { EstrategiaSaturacion } from '../EstrategiaSaturacion.js';

export interface OpcionesSaturacionPonderada {
  ventanaMin: number;
  /** Fewer valid reports than this and the place has no level. */
  minReportes: number;
  /** Average from which the level is MODERADO (inclusive). */
  umbralModerado: number;
  /** Average from which the level is SATURADO (inclusive). */
  umbralSaturado: number;
}

/**
 * Pattern: Strategy (default variant). Owner: M4. Weighted average of the valid reports of the window: a report of age
 * `edad` weighs `1 - edad / ventana`, so the newest ones count the most. Valid = ACTIVO with
 * `0 <= edad < ventana` (ELIMINADO, future and out-of-window rows are discarded). Pure: time only through `ahora`.
 */
export class SaturacionPonderadaStrategy implements EstrategiaSaturacion {
  constructor(private readonly opciones: OpcionesSaturacionPonderada) {}

  calcular(reportes: readonly ReporteSaturacion[], ahora: Date): NivelSaturacion | null {
    const { ventanaMin, minReportes, umbralModerado, umbralSaturado } = this.opciones;
    const ventanaMs = ventanaMin * MS_POR_MINUTO;
    let validos = 0;
    let sumaPonderada = 0;
    let sumaPesos = 0;
    for (const reporte of reportes) {
      if (reporte.estado !== EstadoReporte.ACTIVO) continue;
      const edadMs = ahora.getTime() - reporte.fechaHora.getTime();
      if (edadMs < 0 || edadMs >= ventanaMs) continue;
      const peso = 1 - edadMs / ventanaMs;
      validos += 1;
      sumaPonderada += peso * VALOR_NIVEL[reporte.nivelSaturacion];
      sumaPesos += peso;
    }
    if (validos < minReportes) return null;
    return nivelPorPromedio(sumaPonderada / sumaPesos, { umbralModerado, umbralSaturado });
  }
}
