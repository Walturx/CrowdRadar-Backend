/**
 * Creates the rows a DAO under test needs as foreign keys. The in-memory flavour just
 * hands out ids; a Sequelize flavour inserts real rows so FK constraints hold.
 */
export interface Sembrador {
  usuario(): Promise<number>;
  lugar(): Promise<number>;
  reporte(usuarioId: number, lugarId: number): Promise<number>;
  favorito(usuarioId: number, lugarId: number): Promise<number>;
}
