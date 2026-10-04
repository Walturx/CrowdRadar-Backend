/** Complaint resolution state; mirrors ck_denuncia_estado (migration 05). */
export const EstadoDenuncia = {
  PENDIENTE: 'PENDIENTE',
  PROCEDENTE: 'PROCEDENTE',
  DESESTIMADA: 'DESESTIMADA',
} as const;

export type EstadoDenuncia = (typeof EstadoDenuncia)[keyof typeof EstadoDenuncia];
