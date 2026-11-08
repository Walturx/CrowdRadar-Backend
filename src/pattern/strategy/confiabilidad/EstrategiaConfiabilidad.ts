import type { NivelConfiabilidad } from '../../../enum/NivelConfiabilidad.js';
import type { TipoAccionValidacion } from '../../../enum/TipoAccionValidacion.js';

/** One vote. Every valid vote weighs the same, so nothing about the voter is needed (CRO-73). */
export interface VotoConfiabilidad {
  tipoAccion: TipoAccionValidacion;
}

export interface ResultadoConfiabilidad {
  nivel: NivelConfiabilidad;
  /** 0..100; null while the level is INSUFICIENTE. */
  porcentaje: number | null;
  votos: number;
}

/**
 * Pattern: Strategy (interface). Computes a report's reliability from its votes.
 * Owner: M5 (ConfiabilidadSimpleStrategy: every vote weighs 1). The port stays so another rule can be swapped in
 * without touching ValidacionServiceImpl.
 * Must be pure.
 */
export interface EstrategiaConfiabilidad {
  calcular(votos: readonly VotoConfiabilidad[]): ResultadoConfiabilidad;
}
