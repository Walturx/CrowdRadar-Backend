/** Vote on a report; mirrors ck_validacion_tipo (migration 04). */
export const TipoAccionValidacion = {
  CONFIRMAR: 'CONFIRMAR',
  RECHAZAR: 'RECHAZAR',
} as const;

export type TipoAccionValidacion = (typeof TipoAccionValidacion)[keyof typeof TipoAccionValidacion];
