export interface NotificacionPush {
  readonly titulo: string;
  readonly cuerpo: string;
  /** FCM data payloads are string maps. */
  readonly data?: Readonly<Record<string, string>>;
}

export interface ResultadoPush {
  readonly enviados: number;
  /** Tokens the provider rejected as unregistered; the caller deletes them. */
  readonly tokensInvalidos: readonly string[];
}

/**
 * Pattern: Adapter (port). Owner: M3. Sends push notifications to device tokens (M3 favorite alerts).
 * Rejects when the provider is down; the observer publisher isolates that failure.
 * Implementations: ConsolaNotificadorAdapter.
 */
export interface NotificadorPush {
  enviar(tokens: readonly string[], notificacion: NotificacionPush): Promise<ResultadoPush>;
}
