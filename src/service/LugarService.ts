import type { Lugar } from '../entity/Lugar.js';
import type { CategoriaLugar } from '../enum/CategoriaLugar.js';
import type { NivelEfectivo } from '../enum/NivelSaturacion.js';
import type { Bbox } from '../dao/LugarDAO.js';

export interface ConsultaLugares {
  q?: string;
  bbox?: Bbox;
  categoria?: CategoriaLugar;
  limite: number;
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
  buscar(consulta: ConsultaLugares): Promise<{ lugar: Lugar; nivel: NivelEfectivo }[]>;
  /** Throws LugarNoEncontradoException (404). */
  obtenerDetalle(lugarId: number, usuarioId: number): Promise<DetalleLugar>;
}
