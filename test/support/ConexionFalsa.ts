import type { ConexionBD, ContextoTx } from '../../src/datasource/ConexionBD.js';

/** In-memory ConexionBD used by tests: no database, records what happened. */
export class ConexionFalsa implements ConexionBD {
  verificaciones = 0;
  /** Argument of the latest `verificar(limiteMs)` call. */
  ultimoLimiteMs?: number;
  /** Milliseconds a successful probe takes, to make probes overlap in tests. */
  demoraVerificacionMs = 0;
  cerrada = false;
  transacciones = 0;
  /** When true `verificar` never answers, like a probe stuck waiting for a pool connection. */
  verificacionColgada = false;

  constructor(private readonly errorAlVerificar?: Error) {}

  async transaccion<T>(trabajo: (tx: ContextoTx) => Promise<T>): Promise<T> {
    this.transacciones += 1;
    return trabajo({} as ContextoTx);
  }

  async verificar(limiteMs?: number): Promise<void> {
    this.verificaciones += 1;
    this.ultimoLimiteMs = limiteMs;
    if (this.demoraVerificacionMs > 0) await new Promise((resolver) => setTimeout(resolver, this.demoraVerificacionMs));
    if (this.verificacionColgada) return new Promise<void>(() => undefined);
    if (this.errorAlVerificar) throw this.errorAlVerificar;
  }

  async cerrar(): Promise<void> {
    this.cerrada = true;
  }
}
