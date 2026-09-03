import type { ReporteSaturacion } from '../../../entity/ReporteSaturacion.js';
import type { NivelSaturacion } from '../../../enum/NivelSaturacion.js';

/**
 * Pattern: Strategy (interface). Computes a place's level from its recent reports.
 * Owner: M4 (SaturacionPonderadaStrategy, SaturacionUltimoReporteStrategy); picked by SATURACION_ESTRATEGIA.
 * Must be pure: no I/O and time only through `ahora`.
 */
export interface EstrategiaSaturacion {
  /**
   * `reportes` may contain ELIMINADO, future-dated and out-of-window rows: the strategy discards them.
   * Returns null when there is not enough information (the place shows SIN_INFORMACION).
   */
  calcular(reportes: readonly ReporteSaturacion[], ahora: Date): NivelSaturacion | null;
}
