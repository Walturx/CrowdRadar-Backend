import type { CategoriaLugar } from '../../../enum/CategoriaLugar.js';
import type { LugarResumenResponseDTO } from './LugarResumenResponseDTO.js';

/** One place of GET /api/lugares/explorar: the list entry plus its distance (metres, null without a reference point). */
export interface LugarExploradoResponseDTO extends LugarResumenResponseDTO {
  distanciaMetros: number | null;
}

/** `data` of GET /api/lugares/explorar. */
export interface ExploracionResponseDTO {
  items: LugarExploradoResponseDTO[];
}

/** One category of GET /api/lugares/categorias; `total` may be 0. */
export interface CategoriaResponseDTO {
  categoria: CategoriaLugar;
  etiqueta: string;
  total: number;
}

/** `data` of GET /api/lugares/categorias. */
export interface CategoriasResponseDTO {
  items: CategoriaResponseDTO[];
}
