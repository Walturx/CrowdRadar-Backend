import type { EstadoReporte } from '../enum/EstadoReporte.js';
import type { MotivoSinPuntos } from '../enum/MotivoSinPuntos.js';
import type { NivelSaturacion } from '../enum/NivelSaturacion.js';

/** Domain entity for `reporte_saturacion`: one user's crowd-level report on a place (M4 owns, M5 reads). */
export interface ReporteSaturacion {
  id: number;
  usuarioId: number;
  lugarId: number;
  nivelSaturacion: NivelSaturacion;
  fechaHora: Date;
  /** 0..100, written by M5 after validations; null until computed. */
  nivelConfiabilidad: number | null;
  estado: EstadoReporte;
  puntosOtorgados: number;
  motivoSinPuntos: MotivoSinPuntos | null;
  createdAt: Date;
  updatedAt: Date;
}
