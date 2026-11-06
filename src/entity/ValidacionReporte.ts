import type { TipoAccionValidacion } from '../enum/TipoAccionValidacion.js';

/** Domain entity for `validacion_reporte`: one user's vote on a report; unique per (reporte, usuario) (M5). */
export interface ValidacionReporte {
  id: number;
  reporteId: number;
  usuarioId: number;
  tipoAccion: TipoAccionValidacion;
  /** Voter's karma at vote time. Stored only: every vote weighs 1 in the reliability computation (CRO-73). */
  karmaVotante: number;
  puntosOtorgados: number;
  fechaHora: Date;
  createdAt: Date;
  updatedAt: Date;
}
