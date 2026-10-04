import type { ContextoTx } from '../../../../src/datasource/ConexionBD.js';

/** Callbacks to run when an in-memory transaction ends (commit or rollback), keyed by its handle. */
const alCerrar = new WeakMap<object, Array<() => void>>();

/** Opens the handle of an in-memory transaction; `ConexionFalsa` calls it, tests never do. */
export function abrirTxMemoria(): ContextoTx {
  const tx = {} as ContextoTx;
  alCerrar.set(tx, []);
  return tx;
}

/** Ends the transaction: releases everything it holds (locks). */
export function cerrarTxMemoria(tx: ContextoTx): void {
  const pendientes = alCerrar.get(tx) ?? [];
  alCerrar.delete(tx);
  pendientes.forEach((accion) => accion());
}

/** Registers `accion` for the end of `tx`; false when the handle is not an open in-memory transaction. */
export function alCerrarTx(tx: ContextoTx | undefined, accion: () => void): boolean {
  const lista = tx ? alCerrar.get(tx) : undefined;
  if (!lista) return false;
  lista.push(accion);
  return true;
}

/**
 * Emulates `pg_advisory_xact_lock`: whoever takes a key holds it until its transaction ends; the rest wait in
 * line. Reentrant for the holder. Without an in-memory transaction there is nothing to hold it on (no-op).
 */
export class CerrojosMemoria {
  private readonly tomados = new Map<string, { tx: ContextoTx; libre: Promise<void> }>();

  async adquirir(clave: string, tx: ContextoTx | undefined): Promise<void> {
    if (!tx) return;
    for (let actual = this.tomados.get(clave); actual && actual.tx !== tx; actual = this.tomados.get(clave)) {
      await actual.libre;
    }
    if (this.tomados.get(clave)?.tx === tx) return;
    let liberar!: () => void;
    const libre = new Promise<void>((resolver) => (liberar = resolver));
    const registrado = alCerrarTx(tx, () => {
      this.tomados.delete(clave);
      liberar();
    });
    if (registrado) this.tomados.set(clave, { tx, libre });
  }
}
