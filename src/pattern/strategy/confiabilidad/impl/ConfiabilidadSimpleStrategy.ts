import { clasificarConfiabilidad, type UmbralesConfiabilidad } from '../clasificarConfiabilidad.js';
import type { EstrategiaConfiabilidad, ResultadoConfiabilidad, VotoConfiabilidad } from '../EstrategiaConfiabilidad.js';

/** Pattern: Strategy (concrete). Plain majority: every vote weighs 1 whatever the karma of the voter (HU 5.2 variant). Pure. */
export class ConfiabilidadSimpleStrategy implements EstrategiaConfiabilidad {
  constructor(private readonly umbrales: UmbralesConfiabilidad) {}

  calcular(votos: readonly VotoConfiabilidad[]): ResultadoConfiabilidad {
    return clasificarConfiabilidad(votos, () => 1, this.umbrales);
  }
}
