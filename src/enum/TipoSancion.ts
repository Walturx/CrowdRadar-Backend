export const TipoSancion = {
  SUSPENSION_TEMPORAL: 'SUSPENSION_TEMPORAL',
} as const;

export type TipoSancion = (typeof TipoSancion)[keyof typeof TipoSancion];
