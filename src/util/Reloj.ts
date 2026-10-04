/** Clock port: services read time only through it so tests can pin it (RelojFijo). */
export interface Reloj {
  ahora(): Date;
}

export const relojSistema: Reloj = { ahora: () => new Date() };
