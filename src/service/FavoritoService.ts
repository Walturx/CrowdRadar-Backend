import type { LugarFavorito } from '../entity/LugarFavorito.js';
import type { Lugar } from '../entity/Lugar.js';

export interface FavoritoConLugar {
  favorito: LugarFavorito;
  lugar: Lugar;
}

/**
 * Pattern: Service layer. Favourite places and their alert preference. Owner: M3.
 * Throws LugarNoEncontradoException (404), FavoritoDuplicadoException (409), FavoritoNoEncontradoException (404).
 */
export interface FavoritoService {
  listar(usuarioId: number): Promise<FavoritoConLugar[]>;
  agregar(usuarioId: number, lugarId: number): Promise<LugarFavorito>;
  eliminar(usuarioId: number, lugarId: number): Promise<void>;
  configurarAlertas(usuarioId: number, lugarId: number, activadas: boolean): Promise<LugarFavorito>;
}
