import { NivelConfiabilidad } from '../../../enum/NivelConfiabilidad.js';
import { TipoAccionValidacion } from '../../../enum/TipoAccionValidacion.js';
import type { ResultadoConfiabilidad, VotoConfiabilidad } from './EstrategiaConfiabilidad.js';

/** Thresholds shared by every reliability strategy (CONFIABILIDAD_*). */
export interface UmbralesConfiabilidad {
  /** Votes needed before a level is given (CONFIABILIDAD_MIN_VOTOS). */
  minVotos: number;
  /** Percentage from which a report is ALTA. */
  umbralAlta: number;
  /** Percentage from which a report is MEDIA; below it is BAJA. */
  umbralMedia: number;
}

/**
 * The part both strategies share: weighted share of confirmations, rounded to 2 decimals, then classified. The level is
 * computed from the rounded value so the percentage a client sees never contradicts the level next to it.
 */
export function clasificarConfiabilidad(
  votos: readonly VotoConfiabilidad[],
  peso: (voto: VotoConfiabilidad) => number,
  { minVotos, umbralAlta, umbralMedia }: UmbralesConfiabilidad,
): ResultadoConfiabilidad {
  if (votos.length < minVotos) return { nivel: NivelConfiabilidad.INSUFICIENTE, porcentaje: null, votos: votos.length };
  let confirmaciones = 0;
  let total = 0;
  for (const voto of votos) {
    const w = peso(voto);
    total += w;
    if (voto.tipoAccion === TipoAccionValidacion.CONFIRMAR) confirmaciones += w;
  }
  const porcentaje = Math.round((100 * confirmaciones) / total * 100) / 100;
  const nivel =
    porcentaje >= umbralAlta ? NivelConfiabilidad.ALTA : porcentaje >= umbralMedia ? NivelConfiabilidad.MEDIA : NivelConfiabilidad.BAJA;
  return { nivel, porcentaje, votos: votos.length };
}
