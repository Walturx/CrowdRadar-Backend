import type { ReporteSaturacion } from '../../../../entity/ReporteSaturacion.js';
import { EstadoReporte } from '../../../../enum/EstadoReporte.js';
import type { NivelSaturacion } from '../../../../enum/NivelSaturacion.js';
import type { EstrategiaSaturacion } from '../EstrategiaSaturacion.js';

const MS_POR_MINUTO = 60_000;

export interface OpcionesSaturacionUltimoReporte {
  ventanaMin: number;
}

/**
 * Pattern: Strategy (simple variant). The level of the newest valid report of the window (ACTIVO with
 * `0 <= edad < ventana`), or null when there is none. Pure.
 */
export class SaturacionUltimoReporteStrategy implements EstrategiaSaturacion {
  constructor(private readonly opciones: OpcionesSaturacionUltimoReporte) {}

  calcular(reportes: readonly ReporteSaturacion[], ahora: Date): NivelSaturacion | null {
    const ventanaMs = this.opciones.ventanaMin * MS_POR_MINUTO;
    let ultimo: ReporteSaturacion | null = null;
    for (const reporte of reportes) {
      const edadMs = ahora.getTime() - reporte.fechaHora.getTime();
      const valido = reporte.estado === EstadoReporte.ACTIVO && edadMs >= 0 && edadMs < ventanaMs;
      if (valido && (!ultimo || reporte.fechaHora > ultimo.fechaHora)) ultimo = reporte;
    }
    return ultimo?.nivelSaturacion ?? null;
  }
}
