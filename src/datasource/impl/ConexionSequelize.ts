import type { Sequelize, Transaction } from 'sequelize';
import type { ConexionBD, ContextoTx } from '../ConexionBD.js';

/**
 * Pattern: Adapter. Adapts a Sequelize instance to the ConexionBD port and hides
 * Sequelize's Transaction behind the opaque ContextoTx.
 */
export class ConexionSequelize implements ConexionBD {
  constructor(private readonly sequelize: Sequelize) {}

  transaccion<T>(trabajo: (tx: ContextoTx) => Promise<T>): Promise<T> {
    return this.sequelize.transaction((tx: Transaction) => trabajo(tx as unknown as ContextoTx));
  }

  async verificar(limiteMs?: number): Promise<void> {
    if (limiteMs === undefined) {
      await this.sequelize.authenticate();
      return;
    }
    // SET LOCAL lives only inside this transaction, so the short timeout never leaks to other pool users.
    const timeout = Math.max(1, Math.trunc(limiteMs));
    await this.sequelize.transaction(async (tx) => {
      await this.sequelize.query(`SET LOCAL statement_timeout = ${timeout}`, { transaction: tx });
      await this.sequelize.query('SELECT 1', { transaction: tx });
    });
  }

  async cerrar(): Promise<void> {
    await this.sequelize.close();
  }
}
