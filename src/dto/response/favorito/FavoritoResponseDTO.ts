import type { CategoriaLugar } from '../../../enum/CategoriaLugar.js';
import type { NivelEfectivo } from '../../../enum/NivelSaturacion.js';

/** One favourite; `saturacion` is the effective level (SIN_INFORMACION when stale or unknown). */
export interface FavoritoResponseDTO {
  lugarId: number;
  nombre: string;
  categoria: CategoriaLugar;
  saturacion: NivelEfectivo;
  alertasActivadas: boolean;
}

/** `data` of GET /api/favoritos. */
export interface ListaFavoritosResponseDTO {
  items: FavoritoResponseDTO[];
}
