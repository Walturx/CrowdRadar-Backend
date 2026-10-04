import type { Logger } from '../../../util/logger.js';
import type { NotificacionPush, NotificadorPush, ResultadoPush } from '../NotificadorPush.js';

/** Default provider (PUSH_PROVEEDOR=consola): logs the payload and the recipient count, never the tokens. */
export class ConsolaNotificadorAdapter implements NotificadorPush {
  constructor(private readonly logger: Logger) {}

  async enviar(tokens: readonly string[], notificacion: NotificacionPush): Promise<ResultadoPush> {
    if (tokens.length > 0) {
      this.logger.info(
        { titulo: notificacion.titulo, cuerpo: notificacion.cuerpo, data: notificacion.data, destinatarios: tokens.length },
        'Push (consola)',
      );
    }
    return { enviados: tokens.length, tokensInvalidos: [] };
  }
}
