import type { EnviadorCorreo, MensajeCorreo } from '../../../src/adapter/correo/EnviadorCorreo.js';

/** Spy for EnviadorCorreo: keeps every message; set `fallo` to simulate a provider outage. */
export class CorreoEspia implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];
  fallo: Error | null = null;

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    if (this.fallo) throw this.fallo;
    this.enviados.push(mensaje);
  }
}
