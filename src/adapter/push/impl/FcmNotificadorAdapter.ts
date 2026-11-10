import { NoImplementadoException } from '../../../exception/http/NoImplementadoException.js';
import type { NotificacionPush, NotificadorPush, ResultadoPush } from '../NotificadorPush.js';
import { FirebaseAdminClienteFcmAdapter } from './FirebaseAdminClienteFcmAdapter.js';

/** Outcome of one token of a multicast send; `codigoError` is the provider's error code when `exito` is false. */
export interface RespuestaFcm {
  exito: boolean;
  codigoError?: string;
}

/**
 * Narrow view of Firebase Cloud Messaging: one response per token, in the order of `tokens`. The real
 * implementation, FirebaseAdminClienteFcmAdapter, wraps `firebase-admin` (`messaging().sendEachForMulticast`) and
 * loads it lazily, so the package and the credentials are only needed when PUSH_PROVEEDOR=fcm.
 */
export interface ClienteFcm {
  enviar(tokens: readonly string[], notificacion: NotificacionPush): Promise<RespuestaFcm[]>;
}

export interface OpcionesFcmNotificador {
  proveedor: 'consola' | 'fcm';
  /** Path of the service-account file; required with `fcm`, validated here and read only by the real client. */
  credencialesRuta?: string;
  /** Firebase client; defaults to FirebaseAdminClienteFcmAdapter over `credencialesRuta` when FCM is enabled. */
  cliente?: ClienteFcm;
}

/** Provider errors that mean "this token will never work again": the caller deletes the device. */
const CODIGOS_TOKEN_INVALIDO = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Pattern: Adapter. Owner: M3. Real push provider (PUSH_PROVEEDOR=fcm). It validates its configuration at
 * construction (fail-fast, without reading the credentials or loading firebase-admin), refuses to send with
 * NoImplementadoException unless FCM is enabled, and maps the provider's per-token errors: unregistered tokens are
 * returned for deletion. The in-app alert is the guaranteed channel: the observer logs a push failure and keeps it.
 */
export class FcmNotificadorAdapter implements NotificadorPush {
  private readonly habilitado: boolean;
  private readonly cliente?: ClienteFcm;

  constructor({ proveedor, credencialesRuta, cliente }: OpcionesFcmNotificador) {
    this.habilitado = proveedor === 'fcm';
    if (this.habilitado && !credencialesRuta?.trim()) {
      throw new Error('PUSH_PROVEEDOR=fcm requiere FCM_CREDENCIALES_RUTA.');
    }
    this.cliente = cliente ?? (this.habilitado ? new FirebaseAdminClienteFcmAdapter(credencialesRuta as string) : undefined);
  }

  async enviar(tokens: readonly string[], notificacion: NotificacionPush): Promise<ResultadoPush> {
    if (!this.habilitado || !this.cliente) {
      throw new NoImplementadoException('El proveedor FCM no está habilitado (PUSH_PROVEEDOR=fcm con FCM_CREDENCIALES_RUTA).');
    }
    if (tokens.length === 0) return { enviados: 0, tokensInvalidos: [] };
    const respuestas = await this.cliente.enviar(tokens, notificacion);
    // One response per token, by position: a missing one counts as a failure (the token is kept), an extra one is ignored.
    const porToken = tokens.map((_, i) => respuestas[i]);
    const tokensInvalidos = tokens.filter((_, i) => CODIGOS_TOKEN_INVALIDO.has(porToken[i]?.codigoError ?? ''));
    return { enviados: porToken.filter((r) => r?.exito === true).length, tokensInvalidos };
  }
}
