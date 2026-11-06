import { NivelConfiabilidad } from '../../../enum/NivelConfiabilidad.js';
import { TipoAccionValidacion } from '../../../enum/TipoAccionValidacion.js';
import type { ResultadoConfiabilidad, VotoConfiabilidad } from './EstrategiaConfiabilidad.js';

/** Thresholds of the reliability rule (CONFIABILIDAD_*). */
export interface UmbralesConfiabilidad {
  /** Votes needed before a level is given (CONFIABILIDAD_MIN_VOTOS). */
  minVotos: number;
  /** Percentage from which a report is ALTA. */
  umbralAlta: number;
  /** Percentage from which a report is MEDIA; below it is BAJA. */
  umbralMedia: number;
}

/**
 * Share of confirmations among the votes, every vote weighing 1, rounded to 2 decimals (half up), then classified.
 * The percentage is computed from the integer counts in one division (`round(10000 * c / n) / 100`), so it is exact and
 * matches the same rounding done in SQL. The level is computed from the rounded value so the percentage a client sees
 * never contradicts the level next to it.
 */
export function clasificarConfiabilidad(votos: readonly VotoConfiabilidad[], umbrales: UmbralesConfiabilidad): ResultadoConfiabilidad {
  const confirmaciones = votos.filter((voto) => voto.tipoAccion === TipoAccionValidacion.CONFIRMAR).length;
  return clasificarConteo(confirmaciones, votos.length, umbrales);
}

/** The same rule from the counts alone (`confirmaciones` of `votos`). */
export function clasificarConteo(
  confirmaciones: number,
  votos: number,
  { minVotos, umbralAlta, umbralMedia }: UmbralesConfiabilidad,
): ResultadoConfiabilidad {
  if (votos < minVotos) return { nivel: NivelConfiabilidad.INSUFICIENTE, porcentaje: null, votos };
  const porcentaje = Math.round((10000 * confirmaciones) / votos) / 100;
  const nivel =
    porcentaje >= umbralAlta ? NivelConfiabilidad.ALTA : porcentaje >= umbralMedia ? NivelConfiabilidad.MEDIA : NivelConfiabilidad.BAJA;
  return { nivel, porcentaje, votos };
}
