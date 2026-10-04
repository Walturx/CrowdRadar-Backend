import type { Logger } from '../../util/logger.js';
import type { SaturacionCambiadaEvento } from './SaturacionCambiadaEvento.js';
import type { SaturacionObserver } from './SaturacionObserver.js';
import type { SaturacionSubject } from './SaturacionSubject.js';

/**
 * Pattern: Observer (subject). Starts every subscriber in subscription order, all at once, and resolves when the
 * last one settles. A failing subscriber is logged and skipped: it never breaks the publish nor the others, and a
 * slow one does not hold the others back (the facade also stops waiting for the whole round after its budget).
 * Subscribing the same observer twice is ignored, and a round iterates over a snapshot, so subscribing during a
 * notification only takes effect from the next event.
 */
export class PublicadorSaturacion implements SaturacionSubject {
  private readonly suscriptores = new Set<SaturacionObserver>();

  constructor(private readonly logger: Logger) {}

  suscribir(observador: SaturacionObserver): void {
    this.suscriptores.add(observador);
  }

  async notificar(evento: SaturacionCambiadaEvento): Promise<void> {
    await Promise.all([...this.suscriptores].map((suscriptor) => this.entregar(suscriptor, evento)));
  }

  private async entregar(suscriptor: SaturacionObserver, evento: SaturacionCambiadaEvento): Promise<void> {
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
