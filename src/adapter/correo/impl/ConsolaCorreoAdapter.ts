import { enmascararEmail, enmascararEnlace } from '../../../util/enmascarar.js';
import type { Logger } from '../../../util/logger.js';
import type { EnviadorCorreo, MensajeCorreo } from '../EnviadorCorreo.js';

/**
 * Development provider (CORREO_PROVEEDOR=consola). Never logs a live token: the recipient and the token in the link are
 * masked (last 4 characters). `mostrarEnlace` (CORREO_MOSTRAR_ENLACE_DEV, refused in production) adds one line with the full link.
 */
export class ConsolaCorreoAdapter implements EnviadorCorreo {
  constructor(
    private readonly logger: Logger,
    private readonly opciones: { mostrarEnlace?: boolean } = {},
  ) {}

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    const enlace = /https?:\/\/\S+/i.exec(mensaje.texto)?.[0];
    this.logger.info(
      { para: enmascararEmail(mensaje.para), asunto: mensaje.asunto, enlace: enlace && enmascararEnlace(enlace) },
      'Correo (consola)',
    );
    if (this.opciones.mostrarEnlace && enlace) this.logger.info({ enlace }, 'Correo (consola): enlace completo (solo desarrollo)');
  }
}
