import type { NivelSaturacion } from '../enum/NivelSaturacion.js';

/** Domain entity for `alerta`: an in-app notification about a favourite place changing level (M3). */
export interface Alerta {
  id: number;
  favoritoId: number;
  usuarioId: number;
  lugarId: number;
  /** Null when the place had no level before this change. */
  nivelAnterior: NivelSaturacion | null;
  nivelNuevo: NivelSaturacion;
  mensaje: string;
  leida: boolean;
  fechaHora: Date;
  createdAt: Date;
  updatedAt: Date;
}
