import type { Lugar } from '../entity/Lugar.js';
import type { LugarFavorito } from '../entity/LugarFavorito.js';
import type { NivelEfectivo } from '../enum/NivelSaturacion.js';

/** A favourite with its place and the place level as the API shows it (SIN_INFORMACION when null or stale). */
export interface FavoritoConLugar {
  favorito: LugarFavorito;
  lugar: Lugar;
  nivel: NivelEfectivo;
}

/**
 * Pattern: Service layer. Favourite places and their alert preference. Owner: M3.
 * Throws LugarNoEncontradoException (404), FavoritoDuplicadoException (409), FavoritoNoEncontradoException (404).
 */
export interface FavoritoService {
  /** The favourites of the user, newest first. */
  listar(usuarioId: number): Promise<FavoritoConLugar[]>;
  agregar(usuarioId: number, lugarId: number): Promise<FavoritoConLugar>;
  eliminar(usuarioId: number, lugarId: number): Promise<void>;
  configurarAlertas(usuarioId: number, lugarId: number, activadas: boolean): Promise<FavoritoConLugar>;
}
