import type { EstadoReporte } from '../../../enum/EstadoReporte.js';
import type { MotivoSinPuntos } from '../../../enum/MotivoSinPuntos.js';
import type { NivelSaturacion } from '../../../enum/NivelSaturacion.js';

/** One line of GET /api/reportes/mios. */
export interface ReporteResumenDTO {
  id: number;
  lugar: { id: number; nombre: string };
  nivel: NivelSaturacion;
  /** ISO 8601. */
  fechaHora: string;
  estado: EstadoReporte;
  puntosOtorgados: number;
  motivoSinPuntos: MotivoSinPuntos | null;
}
