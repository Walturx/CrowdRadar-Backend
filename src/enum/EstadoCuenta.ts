export const EstadoCuenta = {
  ACTIVO: 'ACTIVO',
  SUSPENDIDO: 'SUSPENDIDO',
} as const;

export type EstadoCuenta = (typeof EstadoCuenta)[keyof typeof EstadoCuenta];
