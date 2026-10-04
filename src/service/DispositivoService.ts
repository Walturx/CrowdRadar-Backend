import type { PlataformaPush } from '../enum/PlataformaPush.js';

/**
 * Pattern: Service layer. Push devices of the caller. Owner: M3.
 * A push token belongs to ONE user: registering a token that another user holds moves it to the caller, and the
 * previous owner stops receiving it.
 */
export interface DispositivoService {
  /** Upsert by token; `creado` is false when the token already existed (it is then reassigned to the caller). */
  registrar(usuarioId: number, token: string, plataforma: PlataformaPush): Promise<{ creado: boolean }>;
  /** Idempotent and silent: a token that is not the caller's, or does not exist, is left alone without an error. */
  eliminar(usuarioId: number, token: string): Promise<void>;
}
