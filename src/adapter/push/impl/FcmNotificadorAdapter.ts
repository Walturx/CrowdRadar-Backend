import { NoImplementadoException } from '../../../exception/http/NoImplementadoException.js';
import type { NotificacionPush, NotificadorPush, ResultadoPush } from '../NotificadorPush.js';

/** Outcome of one token of a multicast send; `codigoError` is the provider's error code when `exito` is false. */
export interface RespuestaFcm {
  exito: boolean;
  codigoError?: string;
}

/**
 * Narrow view of Firebase Cloud Messaging: one response per token, in the order of `tokens`. The real
 * implementation wraps `firebase-admin` (`messaging().sendEachForMulticast`) and is loaded lazily, so the
 * package and the credentials are only needed when PUSH_PROVEEDOR=fcm.
 */
export interface ClienteFcm {
  enviar(tokens: readonly string[], notificacion: NotificacionPush): Promise<RespuestaFcm[]>;
}

export interface OpcionesFcmNotificador {
  proveedor: 'consola' | 'fcm';
  /** Path of the service-account file; required with `fcm`, validated here and read only by the real client. */
  credencialesRuta?: string;
  /** Firebase client; absent until the integration lands, which keeps the adapter non-functional on purpose. */
  cliente?: ClienteFcm;
}

/** Provider errors that mean "this token will never work again": the caller deletes the device. */
const CODIGOS_TOKEN_INVALIDO = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Pattern: Adapter. Owner: M3. Skeleton of the real push provider (PUSH_PROVEEDOR=fcm). It validates its
 * configuration at construction (fail-fast) and refuses to send with NoImplementadoException unless FCM is
 * enabled AND a Firebase client is wired, so it never ships functional without Firebase. The in-app alert is
 * the guaranteed channel: the observer logs this failure and keeps the alert.
 */
export class FcmNotificadorAdapter implements NotificadorPush {
  private readonly habilitado: boolean;
  private readonly cliente?: ClienteFcm;

  constructor({ proveedor, credencialesRuta, cliente }: OpcionesFcmNotificador) {
    this.habilitado = proveedor === 'fcm';
    if (this.habilitado && !credencialesRuta?.trim()) {
      throw new Error('PUSH_PROVEEDOR=fcm requiere FCM_CREDENCIALES_RUTA.');
    }
    this.cliente = cliente;
  }

  async enviar(tokens: readonly string[], notificacion: NotificacionPush): Promise<ResultadoPush> {
    if (!this.habilitado) {
      throw new NoImplementadoException('El proveedor FCM no está habilitado (PUSH_PROVEEDOR=fcm con FCM_CREDENCIALES_RUTA).');
    }
    if (!this.cliente) {
      throw new NoImplementadoException('FCM no está integrado todavía: falta el cliente firebase-admin.');
    }
    if (tokens.length === 0) return { enviados: 0, tokensInvalidos: [] };
    const respuestas = await this.cliente.enviar(tokens, notificacion);
    const tokensInvalidos = tokens.filter((_, i) => CODIGOS_TOKEN_INVALIDO.has(respuestas[i]?.codigoError ?? ''));
    return { enviados: respuestas.filter((r) => r.exito).length, tokensInvalidos };
  }
}
