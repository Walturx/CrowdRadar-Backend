import type { Alerta } from '../entity/Alerta.js';
import type { PlataformaPush } from '../enum/PlataformaPush.js';
import type { Pagina, Paginacion } from '../dao/Paginacion.js';

/**
 * Pattern: Service layer. In-app alerts and push device registration. Owner: M3.
 * The alerts themselves are created by AlertaFavoritosObserver, not by this service.
 * Throws AlertaNoEncontradaException (404) when the alert is not the caller's.
 */
export interface AlertaService {
  listar(usuarioId: number, paginacion: Paginacion, soloNoLeidas: boolean): Promise<Pagina<Alerta>>;
  marcarLeida(usuarioId: number, alertaId: number): Promise<Alerta>;
  /** Upsert by token: a token moves to the latest user that registers it. */
  registrarDispositivo(usuarioId: number, token: string, plataforma: PlataformaPush): Promise<void>;
  eliminarDispositivo(usuarioId: number, token: string): Promise<void>;
}
