import { EstadoValidacion } from '../../../enum/EstadoValidacion.js';
import { NivelConfiabilidad } from '../../../enum/NivelConfiabilidad.js';
import type { ResultadoConfiabilidad } from './EstrategiaConfiabilidad.js';

/**
 * Validation progress of a report, derived from its reliability (there is no column for it): no votes is
 * SIN_VALIDACIONES; from `minVotosEstado` votes on, ALTA is VALIDADO and BAJA is RECHAZADO; everything else is still
 * EN_VALIDACION. `minVotosEstado` is CONFIABILIDAD_MIN_VOTOS_ESTADO.
 */
export function derivarEstadoValidacion(resultado: ResultadoConfiabilidad, minVotosEstado: number): EstadoValidacion {
  if (resultado.votos === 0) return EstadoValidacion.SIN_VALIDACIONES;
  if (resultado.votos >= minVotosEstado) {
    if (resultado.nivel === NivelConfiabilidad.ALTA) return EstadoValidacion.VALIDADO;
    if (resultado.nivel === NivelConfiabilidad.BAJA) return EstadoValidacion.RECHAZADO;
  }
  return EstadoValidacion.EN_VALIDACION;
}
