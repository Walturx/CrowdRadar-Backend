import type { Logger } from '../../../util/logger.js';
import type { EnviadorCorreo, MensajeCorreo } from '../EnviadorCorreo.js';

/** Default provider (CORREO_PROVEEDOR=consola): logs the message so the link can be followed in development. */
export class ConsolaCorreoAdapter implements EnviadorCorreo {
  constructor(private readonly logger: Logger) {}

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    this.logger.info({ para: mensaje.para, asunto: mensaje.asunto, texto: mensaje.texto }, 'Correo (consola)');
  }
}
