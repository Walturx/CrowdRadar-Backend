/** Saturation level of a place; mirrors ck_lugar_saturacion / ck_reporte_nivel / ck_alerta_nivel_* (migrations 02, 03, 08). */
export const NivelSaturacion = {
  TRANQUILO: 'TRANQUILO',
  MODERADO: 'MODERADO',
  SATURADO: 'SATURADO',
} as const;

export type NivelSaturacion = (typeof NivelSaturacion)[keyof typeof NivelSaturacion];

/** Level as the API shows it: a stored level, or SIN_INFORMACION when there is none or it is stale (M2 R4). */
export const NivelEfectivo = {
  ...NivelSaturacion,
  SIN_INFORMACION: 'SIN_INFORMACION',
} as const;

export type NivelEfectivo = (typeof NivelEfectivo)[keyof typeof NivelEfectivo];
