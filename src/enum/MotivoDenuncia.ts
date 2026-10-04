/** Reason of a report complaint; mirrors ck_denuncia_motivo (migration 05). OTRO requires a detail text. */
export const MotivoDenuncia = {
  INFORMACION_FALSA: 'INFORMACION_FALSA',
  SPAM: 'SPAM',
  CONTENIDO_INAPROPIADO: 'CONTENIDO_INAPROPIADO',
  OTRO: 'OTRO',
} as const;

export type MotivoDenuncia = (typeof MotivoDenuncia)[keyof typeof MotivoDenuncia];
