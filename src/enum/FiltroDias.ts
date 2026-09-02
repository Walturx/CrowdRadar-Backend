/** Day filter of the analytics endpoints (Lima time zone). */
export const FiltroDias = {
  TODOS: 'TODOS',
  LABORABLES: 'LABORABLES',
  FIN_DE_SEMANA: 'FIN_DE_SEMANA',
} as const;

export type FiltroDias = (typeof FiltroDias)[keyof typeof FiltroDias];
