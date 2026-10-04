import type { SaturacionCambiadaEvento } from './SaturacionCambiadaEvento.js';

/**
 * Pattern: Observer (subscriber). Owner: M3 (AlertaFavoritosObserver); C0 owns the audit one. Owner of each implementation: M3 (favorite alerts), C0 (audit).
 * Implementations may throw or reject; the publisher isolates them.
 */
export interface SaturacionObserver {
  /** Stable name used in logs when the subscriber fails. */
  readonly nombre: string;
  alRecibir(evento: SaturacionCambiadaEvento): void | Promise<void>;
}
