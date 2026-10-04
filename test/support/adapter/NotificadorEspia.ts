import type { NotificacionPush, NotificadorPush, ResultadoPush } from '../../../src/adapter/push/NotificadorPush.js';

/** Spy for NotificadorPush: records calls; `invalidos` are reported back as rejected tokens; `fallo` makes it throw. */
export class NotificadorEspia implements NotificadorPush {
  readonly llamadas: { tokens: readonly string[]; notificacion: NotificacionPush }[] = [];
  invalidos: string[] = [];
  fallo: Error | null = null;

  async enviar(tokens: readonly string[], notificacion: NotificacionPush): Promise<ResultadoPush> {
    if (this.fallo) throw this.fallo;
    this.llamadas.push({ tokens, notificacion });
    const tokensInvalidos = tokens.filter((t) => this.invalidos.includes(t));
    return { enviados: tokens.length - tokensInvalidos.length, tokensInvalidos };
  }
}
