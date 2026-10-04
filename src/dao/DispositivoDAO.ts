import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { DispositivoPush } from '../entity/DispositivoPush.js';
import type { PlataformaPush } from '../enum/PlataformaPush.js';

export interface ResultadoRegistro {
  dispositivo: DispositivoPush;
  /** False when the token already existed (it is then re-assigned to the caller). */
  creado: boolean;
}

/** Pattern: DAO (port). Persistence contract for `dispositivo_push`. Owner: M3. */
export interface DispositivoDAO {
  /** Upsert by token: an existing token moves to `usuarioId` and takes the new platform. */
  registrar(
    usuarioId: number,
    tokenFcm: string,
    plataforma: PlataformaPush,
    tx?: ContextoTx,
  ): Promise<ResultadoRegistro>;
  listarTokensPorUsuario(usuarioId: number, tx?: ContextoTx): Promise<string[]>;
  /** Deletes the token only if it belongs to the user; true when a row was deleted. */
  eliminarPorToken(usuarioId: number, tokenFcm: string, tx?: ContextoTx): Promise<boolean>;
  /**
   * Keeps the `maximo` most recently registered devices of the user (re-registering a token makes it recent) and
   * deletes the rest; returns how many were deleted. Other users are never touched.
   */
  conservarMasRecientes(usuarioId: number, maximo: number, tx?: ContextoTx): Promise<number>;
  /** Deletes every device of the user (session ended by a password change or reset); returns how many. */
  eliminarDeUsuario(usuarioId: number, tx?: ContextoTx): Promise<number>;
  /** Deletes tokens the push provider rejected, whoever owns them; returns how many. */
  eliminarTokens(tokens: readonly string[], tx?: ContextoTx): Promise<number>;
}
