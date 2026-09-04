import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { Bbox } from '../entity/Bbox.js';
import type { Lugar } from '../entity/Lugar.js';
import type { CategoriaLugar } from '../enum/CategoriaLugar.js';
import type { NivelEfectivo, NivelSaturacion } from '../enum/NivelSaturacion.js';

/** Map/search filter (M2). All given criteria combine with AND; results are ordered by nombre. */
export interface FiltroLugares {
  /** Accent- and case-insensitive substring of `nombre`; `%` and `_` are literal. */
  q?: string;
  bbox?: Bbox;
  categoria?: CategoriaLugar;
  /**
   * Effective level. A stored level older than `vigenteDesde` (or null) counts as SIN_INFORMACION;
   * without `vigenteDesde` the stored level is taken as is.
   */
  nivel?: NivelEfectivo;
  vigenteDesde?: Date;
  limite: number;
}

/** Explore filter (M3): category and/or bbox; distance and saturation are applied by the service. */
export interface FiltroExploracion {
  categoria?: CategoriaLugar;
  bbox?: Bbox;
}

export interface ConteoCategoria {
  categoria: CategoriaLugar;
  total: number;
}

/**
 * Pattern: DAO (port). Persistence contract for `lugar`. Owner: M2 (Sequelize impl, except
 * `explorar`, which delegates to M3's filtroExploracion). Consumed by M3 and M4; M4 is the
 * only writer of the saturation columns.
 */
export interface LugarDAO {
  buscarPorId(id: number, tx?: ContextoTx): Promise<Lugar | null>;
  /** Existing places among `ids`, without duplicates, in no guaranteed order. */
  buscarPorIds(ids: readonly number[], tx?: ContextoTx): Promise<Lugar[]>;
  buscar(filtro: FiltroLugares, tx?: ContextoTx): Promise<Lugar[]>;
  /** Every matching place ordered by nombre, no limit. */
  explorar(filtro: FiltroExploracion, tx?: ContextoTx): Promise<Lugar[]>;
  /** One entry per CategoriaLugar, with 0 for categories without places. */
  contarPorCategoria(tx?: ContextoTx): Promise<ConteoCategoria[]>;
  /** Writes the (possibly null) level and its timestamp; null when the place does not exist. */
  actualizarSaturacion(
    id: number,
    nivel: NivelSaturacion | null,
    actualizadaEn: Date,
    tx?: ContextoTx,
  ): Promise<Lugar | null>;
}
