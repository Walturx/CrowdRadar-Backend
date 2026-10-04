import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { TokenRecuperacion } from '../entity/TokenRecuperacion.js';

export interface NuevoTokenRecuperacion {
  usuarioId: number;
  /** SHA-256 hex (64 chars) of the emailed token; the plain token is never stored. */
  tokenHash: string;
  expiraEn: Date;
}

/** Pattern: DAO (port). Persistence contract for `token_recuperacion`. Owner: M1. */
export interface TokenRecuperacionDAO {
  crear(datos: NuevoTokenRecuperacion, tx?: ContextoTx): Promise<TokenRecuperacion>;
  buscarPorHash(tokenHash: string, tx?: ContextoTx): Promise<TokenRecuperacion | null>;
  /** Single use: records when the token was spent; false when it does not exist. */
  marcarUsado(id: number, usadoEn: Date, tx?: ContextoTx): Promise<boolean>;
  /**
   * Keeps the `maximo` most recently created live tokens (unused, not expired at `ahora`) of the user and spends the
   * older ones; returns how many it spent. Bounds the live tokens a flood of requests can leave behind.
   */
  limitarVigentes(usuarioId: number, maximo: number, ahora: Date, tx?: ContextoTx): Promise<number>;
  /** Spends every unused token of the user (a new request replaces older ones); returns how many. */
  invalidarVigentesDeUsuario(usuarioId: number, ahora: Date, tx?: ContextoTx): Promise<number>;
}
