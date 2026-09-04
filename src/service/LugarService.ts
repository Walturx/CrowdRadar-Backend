import type { Bbox } from '../entity/Bbox.js';
import type { Lugar } from '../entity/Lugar.js';
import type { CategoriaLugar } from '../enum/CategoriaLugar.js';
import type { NivelEfectivo } from '../enum/NivelSaturacion.js';

export interface ConsultaLugares {
  q?: string;
  bbox?: Bbox;
  categoria?: CategoriaLugar;
  limite: number;
}

/** One search hit: the place and its effective level (a null or stale reading is SIN_INFORMACION). */
export interface ResultadoBusquedaLugar {
  lugar: Lugar;
  nivel: NivelEfectivo;
}

export interface DetalleLugar {
  lugar: Lugar;
  nivel: NivelEfectivo;
  /** Reports in the saturation window. */
  reportesRecientes: number;
  abiertoAhora: boolean | null;
  esFavorito: boolean;
  alertasActivadas: boolean;
}

/**
 * Pattern: Service layer. Search and detail of places.
 * Owner: M2. Reads FavoritoDAO.buscar and ReporteDAO.contarPorLugarDesde. A null or stale level is SIN_INFORMACION.
 */
export interface LugarService {
  buscar(consulta: ConsultaLugares): Promise<ResultadoBusquedaLugar[]>;
  /** Throws LugarNoEncontradoException (404). */
  obtenerDetalle(lugarId: number, usuarioId: number): Promise<DetalleLugar>;
}
