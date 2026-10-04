import type { TipoSancion } from '../enum/TipoSancion.js';

/** Suspension lengths in days allowed by ck_sancion_dias (migration 06). */
export const DIAS_SUSPENSION = [3, 7, 30] as const;

export type DiasSuspension = (typeof DIAS_SUSPENSION)[number];

/** Domain entity for `sancion_usuario`. The active sanction is the source of truth; `usuario.status` is denormalised (M6). */
export interface SancionUsuario {
  id: number;
  usuarioId: number;
  administradorId: number;
  tipo: TipoSancion;
  dias: DiasSuspension;
  motivo: string;
  fechaInicio: Date;
  fechaFin: Date;
  fechaLevantamiento: Date | null;
  levantadaPor: number | null;
  createdAt: Date;
  updatedAt: Date;
}
