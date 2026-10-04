import type { Alerta } from '../entity/Alerta.js';
import type { Pagina, Paginacion } from '../dao/Paginacion.js';

/** An alert with the display name of its place (the list and the mark-as-read answer show it). */
export interface AlertaConLugar {
  alerta: Alerta;
  /** Empty when the place can no longer be resolved. */
  lugarNombre: string;
}

export interface ListadoAlertas {
  pagina: Pagina<AlertaConLugar>;
  /** Unread alerts of the caller in total, not only on this page (drives the badge). */
  noLeidas: number;
}

/**
 * Pattern: Service layer. In-app alerts of the caller. Owner: M3.
 * The alerts themselves are created by AlertaFavoritosObserver, not by this service; push devices belong to
 * DispositivoService.
 * Throws AlertaNoEncontradaException (404) when the alert is not the caller's or does not exist.
 */
export interface AlertaService {
  /** Alerts of the caller, newest first, with the total unread count. */
  listar(usuarioId: number, paginacion: Paginacion): Promise<ListadoAlertas>;
  /** Idempotent. */
  marcarLeida(usuarioId: number, alertaId: number): Promise<AlertaConLugar>;
  contarNoLeidas(usuarioId: number): Promise<number>;
}
