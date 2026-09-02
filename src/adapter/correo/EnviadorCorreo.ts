export interface MensajeCorreo {
  readonly para: string;
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
}

/**
 * Pattern: Adapter (port). Sends transactional email (password recovery, M1).
 * Rejects when the provider fails; callers decide whether that is fatal. Implementations: ConsolaCorreoAdapter.
 */
export interface EnviadorCorreo {
  enviar(mensaje: MensajeCorreo): Promise<void>;
}
