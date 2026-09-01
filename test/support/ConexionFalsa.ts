import type { ConexionBD, ContextoTx } from '../../src/datasource/ConexionBD.js';

/** In-memory ConexionBD used by tests: no database, records what happened. */
export class ConexionFalsa implements ConexionBD {
  verificaciones = 0;
  cerrada = false;
  transacciones = 0;

  constructor(private readonly errorAlVerificar?: Error) {}

  async transaccion<T>(trabajo: (tx: ContextoTx) => Promise<T>): Promise<T> {
    this.transacciones += 1;
    return trabajo({} as ContextoTx);
  }

  async verificar(): Promise<void> {
    this.verificaciones += 1;
    if (this.errorAlVerificar) throw this.errorAlVerificar;
  }

  async cerrar(): Promise<void> {
    this.cerrada = true;
  }
}
