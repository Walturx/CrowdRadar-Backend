import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { Bbox } from '../entity/Bbox.js';
import type { Lugar } from '../entity/Lugar.js';
import type { CategoriaLugar } from '../enum/CategoriaLugar.js';
import type { NivelEfectivo, NivelSaturacion } from '../enum/NivelSaturacion.js';

/**
 * Map/search filter (M2). All given criteria combine with AND; results are ordered by normalised nombre (see
 * util/nombreLugar.ts), then exact nombre, then id, and cut at the smaller of `limite` and the DAO's cap.
 */
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

/**
 * Explore filter (value object M3 passes to `LugarDAO.explorar`): category and/or bbox; distance and saturation
 * are applied by the service. `limite` is mandatory: the result is cut at the smaller of it and the DAO's cap
 * (`LUGARES_LIMITE_MAX`), so no call can read the whole table.
 */
export interface FiltroExploracion {
  categoria?: CategoriaLugar;
  bbox?: Bbox;
  limite: number;
}

export interface ConteoCategoria {
  categoria: CategoriaLugar;
  total: number;
}

/**
 * Pattern: DAO (port). Persistence contract for `lugar`. Owner: M2, the whole Sequelize implementation included
 * (`buscar`, `explorar`, `contarPorCategoria`). M3 consumes `explorar` with a `FiltroExploracion`; M4 consumes
 * the reads and is the only writer of the saturation columns.
 */
export interface LugarDAO {
  buscarPorId(id: number, tx?: ContextoTx): Promise<Lugar | null>;
  /** Existing places among `ids`, without duplicates, in no guaranteed order. */
  buscarPorIds(ids: readonly number[], tx?: ContextoTx): Promise<Lugar[]>;
  buscar(filtro: FiltroLugares, tx?: ContextoTx): Promise<Lugar[]>;
  /** Matching places in the same order as `buscar`, at most `filtro.limite` (and never more than the DAO's cap). */
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
