/** Validation progress of a report as the author sees it (M5, HU 5.x). */
export const EstadoValidacion = {
  SIN_VALIDACIONES: 'SIN_VALIDACIONES',
  EN_VALIDACION: 'EN_VALIDACION',
  VALIDADO: 'VALIDADO',
  RECHAZADO: 'RECHAZADO',
} as const;

export type EstadoValidacion = (typeof EstadoValidacion)[keyof typeof EstadoValidacion];
