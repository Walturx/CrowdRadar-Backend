import type { ConteoCategoria } from '../dao/LugarDAO.js';
import type { CategoriasResponseDTO, ExploracionResponseDTO } from '../dto/response/lugar/ExploracionResponseDTO.js';
import { CategoriaLugar } from '../enum/CategoriaLugar.js';
import type { LugarExplorado } from '../service/ExploracionService.js';
import { LugarMapper } from './LugarMapper.js';

export const MENSAJE_EXPLORACION = 'Lugares obtenidos correctamente.';
export const MENSAJE_CATEGORIAS = 'Categorías obtenidas correctamente.';
const MENSAJE_SIN_CATEGORIA = 'No hay lugares cercanos disponibles para esa categoría.';
const MENSAJE_SIN_NIVEL = 'No hay lugares cercanos con ese nivel de saturación.';
const MENSAJE_SIN_COINCIDENCIAS = 'No hay lugares cercanos que cumplan con los filtros seleccionados.';

const ETIQUETAS: Record<CategoriaLugar, string> = {
  [CategoriaLugar.PARQUE]: 'Parques',
  [CategoriaLugar.CENTRO_COMERCIAL]: 'Centros comerciales',
  [CategoriaLugar.MERCADO]: 'Mercados',
  [CategoriaLugar.TRANSPORTE]: 'Transporte',
  [CategoriaLugar.PLAZA]: 'Plazas',
  [CategoriaLugar.PLAYA]: 'Playas',
};

/** Pattern: Mapper. The only place that turns an exploration result into what leaves over HTTP. */
export const ExploracionMapper = {
  aResponse(resultados: readonly LugarExplorado[]): ExploracionResponseDTO {
    return {
      items: resultados.map(({ lugar, nivel, distanciaMetros }) => ({
        ...LugarMapper.aResumen({ lugar, nivel }),
        distanciaMetros: distanciaMetros === null ? null : Math.round(distanciaMetros),
      })),
    };
  },

  /** An empty result names the filter that emptied it (HU 3.5 c3, 3.6 c3); with both (or the radius alone) it is generic. */
  mensaje(resultados: readonly LugarExplorado[], filtros: { categoria?: unknown; saturacion?: unknown }): string {
    if (resultados.length > 0) return MENSAJE_EXPLORACION;
    const { categoria, saturacion } = filtros;
    if (categoria !== undefined && saturacion === undefined) return MENSAJE_SIN_CATEGORIA;
    if (saturacion !== undefined && categoria === undefined) return MENSAJE_SIN_NIVEL;
    return MENSAJE_SIN_COINCIDENCIAS;
  },

  aCategorias(conteo: readonly ConteoCategoria[]): CategoriasResponseDTO {
    return { items: conteo.map(({ categoria, total }) => ({ categoria, etiqueta: ETIQUETAS[categoria], total })) };
  },
};
