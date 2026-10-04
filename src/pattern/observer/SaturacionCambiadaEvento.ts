import type { NivelSaturacion } from '../../enum/NivelSaturacion.js';

/**
 * Domain event: the stored saturation level of a place changed (published by M4 after the commit).
 * Null levels mean "no known level" (first report ever, or a stale reading).
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
  return {
    tipo: 'SATURACION_CAMBIADA',
    ocurridoEn: datos.ocurridoEn,
    lugarId: datos.lugarId,
    nivelAnterior: datos.nivelAnterior,
    nivelNuevo: datos.nivelNuevo,
    autorId: datos.autorId,
  };
}
