import { clasificarConfiabilidad, type UmbralesConfiabilidad } from '../clasificarConfiabilidad.js';
import type { EstrategiaConfiabilidad, ResultadoConfiabilidad, VotoConfiabilidad } from '../EstrategiaConfiabilidad.js';

/**
 * Pattern: Strategy (concrete). Plain majority: every valid vote weighs 1, whoever casts it (CRO-73; HU 5.2). Pure.
 */
export class ConfiabilidadSimpleStrategy implements EstrategiaConfiabilidad {
  constructor(private readonly umbrales: UmbralesConfiabilidad) {}

  calcular(votos: readonly VotoConfiabilidad[]): ResultadoConfiabilidad {
    return clasificarConfiabilidad(votos, this.umbrales);
  }
}
