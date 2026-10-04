import type { EstadoDenuncia } from '../../../enum/EstadoDenuncia.js';
import type { MotivoDenuncia } from '../../../enum/MotivoDenuncia.js';

/** data of POST /api/reportes/:id/denuncias. The complainant is the caller, so no user data is echoed. */
export interface DenunciaCreadaResponseDTO {
  id: number;
  reporteId: number;
  motivo: MotivoDenuncia;
  detalle: string | null;
  estado: EstadoDenuncia;
  /** ISO 8601. */
  fechaHora: string;
}
