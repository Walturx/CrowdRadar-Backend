import type { FavoritoResponseDTO, ListaFavoritosResponseDTO } from '../dto/response/favorito/FavoritoResponseDTO.js';
import type { FavoritoConLugar } from '../service/FavoritoService.js';

export const MENSAJE_FAVORITO_AGREGADO = 'Añadido a favoritos';
export const MENSAJE_ALERTAS_ACTUALIZADAS = 'Alertas actualizadas correctamente.';
const MENSAJE_LISTA = 'Favoritos obtenidos correctamente.';
const MENSAJE_SIN_FAVORITOS = 'No tienes lugares favoritos registrados.';

/** Pattern: Mapper. The only place that turns a favourite into what leaves over HTTP. */
export const FavoritoMapper = {
  aResponse({ favorito, lugar, nivel }: FavoritoConLugar): FavoritoResponseDTO {
    return {
      lugarId: favorito.lugarId,
      nombre: lugar.nombre,
      categoria: lugar.categoria,
      saturacion: nivel,
      alertasActivadas: favorito.alertasActivadas,
    };
  },

  aLista(favoritos: readonly FavoritoConLugar[]): ListaFavoritosResponseDTO {
    return { items: favoritos.map(FavoritoMapper.aResponse) };
  },

  /** An empty list explains itself (HU 8.2 c3). */
  mensajeLista(favoritos: readonly FavoritoConLugar[]): string {
    return favoritos.length === 0 ? MENSAJE_SIN_FAVORITOS : MENSAJE_LISTA;
  },
};
