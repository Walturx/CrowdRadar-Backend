import type { MotivoSinPuntos } from '../../../enum/MotivoSinPuntos.js';
import type { NivelSaturacion } from '../../../enum/NivelSaturacion.js';

/** The report as the create response shows it. */
export interface ReporteCreadoDTO {
  id: number;
  lugarId: number;
  nivel: NivelSaturacion;
  /** ISO 8601. */
  fechaHora: string;
}

export interface KarmaReporteDTO {
  puntosGanados: number;
  /** The user's karma after this report. */
  total: number;
  motivoSinPuntos: MotivoSinPuntos | null;
}

/** data of POST /api/reportes. */
export interface ReporteCreadoResponseDTO {
  reporte: ReporteCreadoDTO;
  karma: KarmaReporteDTO;
  /** The place's level after this report; null while there is not enough information. */
  saturacionLugar: { nivel: NivelSaturacion | null; actualizadoEn: string | null };
}
