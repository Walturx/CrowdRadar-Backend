import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { Puntaje } from '../entity/puntaje.js';

/**
 * Pattern: Service layer (port). Owner: M5. Points and tier of users (CRO-72), computed on every read from their reports
 * and votes with the configured validation rule; never stored and without daily caps. Account, admin and report
 * streams read it; nothing writes it.
 */
export interface PuntajeService {
  /** Points and tier of one user (0 and CROWD_BABY when they have none, or do not exist). */
  obtener(usuarioId: number, tx?: ContextoTx): Promise<Puntaje>;
  /** Points and tier of many users in one read (a page of the admin directory). One entry per distinct id. */
  obtenerVarios(usuarioIds: readonly number[]): Promise<Map<number, Puntaje>>;
  /** Points each report gives its author: PUNTOS_POR_REPORTE_VALIDADO while ACTIVO and VALIDADO, else 0. One read. */
  puntosDeReportes(reporteIds: readonly number[]): Promise<Map<number, number>>;
}
