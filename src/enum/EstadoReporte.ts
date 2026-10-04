/** Report lifecycle; mirrors ck_reporte_estado (migration 03). */
export const EstadoReporte = {
  ACTIVO: 'ACTIVO',
  ELIMINADO: 'ELIMINADO',
} as const;

export type EstadoReporte = (typeof EstadoReporte)[keyof typeof EstadoReporte];
