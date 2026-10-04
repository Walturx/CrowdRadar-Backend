import type { NivelConfiabilidad } from '../../../enum/NivelConfiabilidad.js';
import type { TipoAccionValidacion } from '../../../enum/TipoAccionValidacion.js';

/** One vote with the voter's karma at vote time (ValidacionReporte.karmaVotante). */
export interface VotoConfiabilidad {
  tipoAccion: TipoAccionValidacion;
  karmaVotante: number;
}

export interface ResultadoConfiabilidad {
  nivel: NivelConfiabilidad;
  /** 0..100; null while the level is INSUFICIENTE. */
  porcentaje: number | null;
  votos: number;
}

/**
 * Pattern: Strategy (interface). Computes a report's reliability from its votes.
 * Owner: M5 (ConfiabilidadPonderadaKarmaStrategy, ConfiabilidadSimpleStrategy); picked by CONFIABILIDAD_ESTRATEGIA.
 * Must be pure.
 */
export interface EstrategiaConfiabilidad {
  calcular(votos: readonly VotoConfiabilidad[]): ResultadoConfiabilidad;
}
