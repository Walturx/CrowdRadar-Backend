/** Why a report earned no karma; mirrors ck_reporte_motivo_sin_puntos (migration 03). */
export const MotivoSinPuntos = {
  TOPE_DIARIO: 'TOPE_DIARIO',
  REPORTE_ELIMINADO: 'REPORTE_ELIMINADO',
} as const;

export type MotivoSinPuntos = (typeof MotivoSinPuntos)[keyof typeof MotivoSinPuntos];
