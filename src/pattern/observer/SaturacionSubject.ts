import type { SaturacionCambiadaEvento } from './SaturacionCambiadaEvento.js';
import type { SaturacionObserver } from './SaturacionObserver.js';

/**
 * Pattern: Observer (subject interface). What the facades of M4 and M6 depend on to announce a level change
 * after their transaction committed; PublicadorSaturacion is the implementation wired by the composition root.
 */
export interface SaturacionSubject {
  suscribir(observador: SaturacionObserver): void;
  /** Never rejects: a failing subscriber is logged and skipped. */
  notificar(evento: SaturacionCambiadaEvento): Promise<void>;
}
