import type { Logger } from '../../util/logger.js';
import type { SaturacionCambiadaEvento } from './SaturacionCambiadaEvento.js';
import type { SaturacionObserver } from './SaturacionObserver.js';

/** Pattern: Observer (subscriber). Leaves an audit trail of every saturation change in the logs. */
export class AuditoriaSaturacionObserver implements SaturacionObserver {
  readonly nombre = 'auditoria-saturacion';

  constructor(private readonly logger: Logger) {}

  alRecibir(evento: SaturacionCambiadaEvento): void {
    this.logger.info(
      {
        lugarId: evento.lugarId,
        nivelAnterior: evento.nivelAnterior,
        nivelNuevo: evento.nivelNuevo,
        autorId: evento.autorId,
      },
      'Cambio de saturacion',
    );
  }
}
