declare const marcaTx: unique symbol;

/**
 * Opaque transaction handle. Services pass it through to DAOs; only the
 * Sequelize adapters know what is inside (design: ContextoTx opaco).
 */
export interface ContextoTx {
  readonly [marcaTx]: true;
}

/** Port over the database connection used by services and the composition root. */
export interface ConexionBD {
  /** Runs `trabajo` inside a transaction: commit on resolve, rollback on reject. */
  transaccion<T>(trabajo: (tx: ContextoTx) => Promise<T>): Promise<T>;
  /** Resolves when the database answers; rejects (connectivity error) otherwise. */
  verificar(): Promise<void>;
  cerrar(): Promise<void>;
}
