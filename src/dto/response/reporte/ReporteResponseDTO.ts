import type { NivelSaturacion } from '../../../enum/NivelSaturacion.js';

/** The report as the create response shows it. */
export interface ReporteCreadoDTO {
  id: number;
  lugarId: number;
  nivel: NivelSaturacion;
  /** ISO 8601. */
  fechaHora: string;
}

/** data of POST /api/reportes. */
export interface ReporteCreadoResponseDTO {
  reporte: ReporteCreadoDTO;
  /** The place's level after this report; null while there is not enough information. */
  saturacionLugar: { nivel: NivelSaturacion | null; actualizadoEn: string | null };
}
