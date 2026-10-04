/** Place category; mirrors ck_lugar_categoria (migration 02). */
export const CategoriaLugar = {
  PARQUE: 'PARQUE',
  CENTRO_COMERCIAL: 'CENTRO_COMERCIAL',
  MERCADO: 'MERCADO',
  TRANSPORTE: 'TRANSPORTE',
  PLAZA: 'PLAZA',
  PLAYA: 'PLAYA',
} as const;

export type CategoriaLugar = (typeof CategoriaLugar)[keyof typeof CategoriaLugar];
