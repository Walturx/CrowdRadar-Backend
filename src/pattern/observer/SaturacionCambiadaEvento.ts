import type { NivelSaturacion } from '../../enum/NivelSaturacion.js';

/**
 * Pattern: Observer (event payload). Owner: M4 (publisher, jointly with M3 as consumer).
 * Domain event: the stored saturation level of a place changed (published after the commit).
 * Both levels are nullable: null means "no known level" (first report ever, or a stale reading).
 */
export interface SaturacionCambiadaEvento {
  readonly tipo: 'SATURACION_CAMBIADA';
  readonly ocurridoEn: Date;
  readonly lugarId: number;
  readonly nivelAnterior: NivelSaturacion | null;
  readonly nivelNuevo: NivelSaturacion | null;
  readonly autorId: number;
}

export function crearEventoSaturacion(datos: Omit<SaturacionCambiadaEvento, 'tipo'>): SaturacionCambiadaEvento {
  return { ...datos, tipo: 'SATURACION_CAMBIADA' };
}
