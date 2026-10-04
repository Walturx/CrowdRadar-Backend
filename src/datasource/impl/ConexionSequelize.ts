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

  async verificar(): Promise<void> {
    await this.sequelize.authenticate();
  }

  async cerrar(): Promise<void> {
    await this.sequelize.close();
  }
}
