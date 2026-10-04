import type { Logger } from '../../util/logger.js';
import type { SaturacionCambiadaEvento } from './SaturacionCambiadaEvento.js';
import type { SaturacionObserver } from './SaturacionObserver.js';

/**
 * Pattern: Observer (subject). Delivers each event to the subscribers in subscription order.
 * A failing subscriber is logged and skipped: it never breaks the publish nor the others.
 */
export class PublicadorSaturacion {
  private readonly suscriptores: SaturacionObserver[] = [];

  constructor(private readonly logger: Logger) {}

  suscribir(observador: SaturacionObserver): void {
    this.suscriptores.push(observador);
  }

  async notificar(evento: SaturacionCambiadaEvento): Promise<void> {
    for (const suscriptor of this.suscriptores) {
      try {
        await suscriptor.alRecibir(evento);
      } catch (err) {
        this.logger.error(
          { err, suscriptor: suscriptor.nombre, tipoEvento: evento.tipo, lugarId: evento.lugarId },
          'Fallo un suscriptor de eventos; se ignora',
        );
      }
    }
  }
}
