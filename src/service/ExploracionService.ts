import type { Lugar } from '../entity/Lugar.js';
import type { CategoriaLugar } from '../enum/CategoriaLugar.js';
import type { NivelEfectivo } from '../enum/NivelSaturacion.js';
import type { ConteoCategoria } from '../dao/LugarDAO.js';

export interface ConsultaExploracion {
  categoria?: CategoriaLugar;
  nivel?: NivelEfectivo;
  /** Reference point; with it every result carries its distance and the list is ordered by it. */
  lat?: number;
  lng?: number;
  /** 0.1..20 km, default RADIO_BUSQUEDA_KM. */
  radioKm: number;
}

export interface LugarExplorado {
  lugar: Lugar;
  nivel: NivelEfectivo;
  distanciaMetros: number | null;
}

/**
 * Pattern: Service layer. Explore places by category, distance and saturation (ISP split from LugarService).
 * Owner: M3 (uses util/geo and lugar/filtroExploracion). Reads LugarDAO.explorar.
 */
export interface ExploracionService {
  explorar(consulta: ConsultaExploracion): Promise<LugarExplorado[]>;
  listarCategorias(): Promise<ConteoCategoria[]>;
}
