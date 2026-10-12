/**
 * Creates the rows a DAO under test needs as foreign keys. The in-memory flavour just
 * hands out ids; a Sequelize flavour inserts real rows so FK constraints hold.
 */
export interface Sembrador {
  usuario(): Promise<number>;
  /** A user of the demo data: the email carries the synthetic domain (spec M4 R10). */
  usuarioSintetico(): Promise<number>;
  lugar(): Promise<number>;
  reporte(usuarioId: number, lugarId: number): Promise<number>;
  favorito(usuarioId: number, lugarId: number): Promise<number>;
}

/** An id no seeded row has; fits an INTEGER column. Used to provoke foreign-key violations. */
export const ID_INEXISTENTE = 2_000_000_000;
