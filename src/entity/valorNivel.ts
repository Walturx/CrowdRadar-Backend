import { NivelSaturacion } from '../enum/NivelSaturacion.js';

/**
 * The number each level stands for when levels are averaged (1 = calm, 3 = saturated). Defined once: the weighted
 * strategy, the analytics service and the SQL `CASE` of `ReporteDAOSequelize.agregarPorHora` all derive from it.
 */
export const VALOR_NIVEL: Readonly<Record<NivelSaturacion, number>> = {
  TRANQUILO: 1,
  MODERADO: 2,
  SATURADO: 3,
};

/** Averages from which the level is MODERADO and SATURADO (inclusive), SATURACION_UMBRAL_*. */
export interface UmbralesNivel {
  umbralModerado: number;
  umbralSaturado: number;
}

/** Level of an average of `VALOR_NIVEL` values: below the moderate threshold calm, below the saturated one moderate. */
export function nivelPorPromedio(promedio: number, { umbralModerado, umbralSaturado }: UmbralesNivel): NivelSaturacion {
  if (promedio < umbralModerado) return NivelSaturacion.TRANQUILO;
  return promedio < umbralSaturado ? NivelSaturacion.MODERADO : NivelSaturacion.SATURADO;
}
