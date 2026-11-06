import { Tier } from '../enum/Tier.js';

/** Points for each own ACTIVO report whose validation state is VALIDADO (CRO-72). */
export const PUNTOS_POR_REPORTE_VALIDADO = 10;

/** Points for each vote whose `tipo_accion` matches the state of an ACTIVO report: CONFIRMAR-VALIDADO, RECHAZAR-RECHAZADO. */
export const PUNTOS_POR_VOTO_ACERTADO = 2;

/**
 * What a user's points are made of. Both counts are read by one query (PuntajeDAO) every time: points are never stored,
 * have no daily cap, and follow the reports automatically (a report that stops being VALIDADO, or is removed, stops
 * counting for its author and its voters).
 */
export interface AportesUsuario {
  reportesValidados: number;
  votosAcertados: number;
}

/** A user's points and the tier they fall in. */
export interface Puntaje {
  puntos: number;
  tier: Tier;
}

/**
 * Lowest points of each tier, lowest tier first. Defined once: `tierDe` and the docs derive from it.
 * Crowd Baby 0-49, Crowd Explorer 50-149, Crowd Collaborator 150-299, Crowd Royalty 300 or more.
 */
export const UMBRALES_TIER: readonly { tier: Tier; desde: number }[] = Object.freeze([
  { tier: Tier.CROWD_BABY, desde: 0 },
  { tier: Tier.CROWD_EXPLORER, desde: 50 },
  { tier: Tier.CROWD_COLLABORATOR, desde: 150 },
  { tier: Tier.CROWD_ROYALTY, desde: 300 },
]);

/** The highest tier whose threshold the points reach (thresholds are inclusive). */
export function tierDe(puntos: number): Tier {
  let tier: Tier = Tier.CROWD_BABY;
  for (const umbral of UMBRALES_TIER) if (puntos >= umbral.desde) tier = umbral.tier;
  return tier;
}

export function puntajeDe({ reportesValidados, votosAcertados }: AportesUsuario): Puntaje {
  const puntos = PUNTOS_POR_REPORTE_VALIDADO * reportesValidados + PUNTOS_POR_VOTO_ACERTADO * votosAcertados;
  return { puntos, tier: tierDe(puntos) };
}
