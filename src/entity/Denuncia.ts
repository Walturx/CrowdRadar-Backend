import type { EstadoDenuncia } from '../enum/EstadoDenuncia.js';
import type { MotivoDenuncia } from '../enum/MotivoDenuncia.js';

/** Domain entity for `denuncia`: a user's complaint about a report; unique per (reporte, usuario) (M5 creates, M6 resolves). */
export interface Denuncia {
  id: number;
  reporteId: number;
  usuarioId: number;
  motivo: MotivoDenuncia;
  /** Required when `motivo` is OTRO. */
  detalle: string | null;
  estado: EstadoDenuncia;
  fechaHora: Date;
  resueltaPor: number | null;
  resueltaEn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
