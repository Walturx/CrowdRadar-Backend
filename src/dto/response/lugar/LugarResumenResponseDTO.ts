import type { CategoriaLugar } from '../../../enum/CategoriaLugar.js';
import type { NivelEfectivo } from '../../../enum/NivelSaturacion.js';

/** One place of GET /api/lugares; `saturacion` is the effective level as text (D-4). */
export interface LugarResumenResponseDTO {
  id: number;
  nombre: string;
  categoria: CategoriaLugar;
  latitud: number;
  longitud: number;
  saturacion: NivelEfectivo;
}

/** `data` of GET /api/lugares. */
export interface ListaLugaresResponseDTO {
  items: LugarResumenResponseDTO[];
}
