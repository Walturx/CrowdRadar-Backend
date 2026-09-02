import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { LugarFavorito } from '../entity/LugarFavorito.js';

/**
 * Pattern: DAO (port). Persistence contract for `lugar_favorito`. Owner: M3; M2 consumes
 * `buscar` (esFavorito/alertasActivadas). `crear` throws ConflictoException when the pair
 * exists (the service maps it to FAVORITO_DUPLICADO). Deleting a favourite cascades to its
 * alerts in the database.
 */
export interface FavoritoDAO {
  /** New favourites have alertasActivadas = true. */
  crear(usuarioId: number, lugarId: number, tx?: ContextoTx): Promise<LugarFavorito>;
  buscar(usuarioId: number, lugarId: number, tx?: ContextoTx): Promise<LugarFavorito | null>;
  /** The user favourites, newest first. */
  listarPorUsuario(usuarioId: number, tx?: ContextoTx): Promise<LugarFavorito[]>;
  /** True when a row was deleted. */
  eliminar(usuarioId: number, lugarId: number, tx?: ContextoTx): Promise<boolean>;
  /** Idempotent; null when the place is not a favourite of the user. */
  actualizarAlertas(
    usuarioId: number,
    lugarId: number,
    activadas: boolean,
    tx?: ContextoTx,
  ): Promise<LugarFavorito | null>;
  /** Favourites of the place whose owner wants alerts (fan-out recipients). */
  listarConAlertasPorLugar(lugarId: number, tx?: ContextoTx): Promise<LugarFavorito[]>;
}
