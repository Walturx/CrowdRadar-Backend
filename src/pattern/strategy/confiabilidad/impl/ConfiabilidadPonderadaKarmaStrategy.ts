import { clasificarConfiabilidad, type UmbralesConfiabilidad } from '../clasificarConfiabilidad.js';
import type { EstrategiaConfiabilidad, ResultadoConfiabilidad, VotoConfiabilidad } from '../EstrategiaConfiabilidad.js';

export interface OpcionesPonderadaKarma extends UmbralesConfiabilidad {
  /** Karma above this stops adding weight (TOPE_KARMA_PESO). */
  topeKarmaPeso: number;
}

/**
 * Pattern: Strategy (concrete). Each vote weighs `1 + min(karma at vote time, topeKarmaPeso) / 100`, so a voter with
 * karma 500 or more counts as 6 people and a newcomer as 1. Pure.
 */
export class ConfiabilidadPonderadaKarmaStrategy implements EstrategiaConfiabilidad {
  constructor(private readonly opciones: OpcionesPonderadaKarma) {}

  calcular(votos: readonly VotoConfiabilidad[]): ResultadoConfiabilidad {
    const tope = this.opciones.topeKarmaPeso;
    return clasificarConfiabilidad(votos, (voto) => 1 + Math.min(Math.max(voto.karmaVotante, 0), tope) / 100, this.opciones);
  }
}
