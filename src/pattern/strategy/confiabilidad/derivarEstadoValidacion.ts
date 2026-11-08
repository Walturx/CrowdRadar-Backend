import { EstadoValidacion } from '../../../enum/EstadoValidacion.js';
import { NivelConfiabilidad } from '../../../enum/NivelConfiabilidad.js';
import { clasificarConteo, type UmbralesConfiabilidad } from './clasificarConfiabilidad.js';
import type { ResultadoConfiabilidad } from './EstrategiaConfiabilidad.js';

/**
 * Everything that decides a report's validation state: the reliability thresholds (CONFIABILIDAD_MIN_VOTOS,
 * CONFIABILIDAD_UMBRAL_*) plus CONFIABILIDAD_MIN_VOTOS_ESTADO. Built once from the configuration
 * (`reglaEstadoValidacion` in container/infraestructura.ts) for the strategy, the service and the points query.
 */
export interface ReglaEstadoValidacion extends UmbralesConfiabilidad {
  minVotosEstado: number;
}

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

/**
 * Validation state of a report with `confirmaciones` of `votos` (every vote weighs 1). This is the rule the points
 * query (PuntajeDAOSequelize) reproduces in SQL; their agreement is pinned by the PuntajeDAO contract tests.
 */
export function estadoValidacionPorConteo(confirmaciones: number, votos: number, regla: ReglaEstadoValidacion): EstadoValidacion {
  return derivarEstadoValidacion(clasificarConteo(confirmaciones, votos, regla), regla.minVotosEstado);
}
