/** Report reliability band computed by EstrategiaConfiabilidad (not persisted as text). */
export const NivelConfiabilidad = {
  INSUFICIENTE: 'INSUFICIENTE',
  BAJA: 'BAJA',
  MEDIA: 'MEDIA',
  ALTA: 'ALTA',
} as const;

export type NivelConfiabilidad = (typeof NivelConfiabilidad)[keyof typeof NivelConfiabilidad];
