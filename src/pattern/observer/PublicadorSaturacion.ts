import type { Logger } from '../../util/logger.js';
import type { SaturacionCambiadaEvento } from './SaturacionCambiadaEvento.js';
import type { SaturacionObserver } from './SaturacionObserver.js';
import type { SaturacionSubject } from './SaturacionSubject.js';

/**
 * Pattern: Observer (subject). Delivers each event to the subscribers in subscription order.
 * A failing subscriber is logged and skipped: it never breaks the publish nor the others.
 *
 * Delivery is sequential: each subscriber is awaited before the next one runs, so a slow subscriber delays
 * the ones after it (and the `notificar` promise the facade awaits). Subscribing the same observer twice is
 * ignored, and a round iterates over a snapshot, so subscribing during a notification only takes effect
 * from the next event.
 */
export class PublicadorSaturacion implements SaturacionSubject {
  private readonly suscriptores = new Set<SaturacionObserver>();

  constructor(private readonly logger: Logger) {}

  suscribir(observador: SaturacionObserver): void {
    this.suscriptores.add(observador);
  }

  async notificar(evento: SaturacionCambiadaEvento): Promise<void> {
    for (const suscriptor of [...this.suscriptores]) {
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
