import type { EstadoReporte } from '../../../enum/EstadoReporte.js';
import type { NivelSaturacion } from '../../../enum/NivelSaturacion.js';

/** One line of GET /api/reportes/mios. */
export interface ReporteResumenDTO {
  id: number;
  lugar: { id: number; nombre: string };
  nivel: NivelSaturacion;
  /** ISO 8601. */
  fechaHora: string;
  estado: EstadoReporte;
  /** Points the report gives its author now: 10 while it is VALIDADO, else 0 (CRO-72). */
  puntos: number;
}
