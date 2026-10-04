import { fn, literal, Op, where, type Order, type Transaction, type WhereOptions } from 'sequelize';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import type { Lugar, TipoOsm } from '../../../entity/Lugar.js';
import { CategoriaLugar } from '../../../enum/CategoriaLugar.js';
import { NivelEfectivo, type NivelSaturacion } from '../../../enum/NivelSaturacion.js';
import type { ConteoCategoria, FiltroExploracion, FiltroLugares, LugarDAO } from '../../LugarDAO.js';
import { LugarModel } from './model/LugarModel.js';

const aTransaccion = (tx?: ContextoTx) => tx as unknown as Transaction | undefined;

/** Letters with a diacritic and their plain form, one to one (the `translate()` arguments). */
const CON_ACENTO = 'ÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÑÇáàâäéèêëíìîïóòôöúùûüñç';
const SIN_ACENTO = 'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc';

/**
 * `nombre` without accents and in lower case, computed with `translate()` so no extension (`unaccent`) is
 * needed. Upper-case letters are mapped before `lower()` because `lower()` of a non-ASCII letter depends on
 * the database locale. Constant text only: user input never goes into it.
 */
const NOMBRE_NORMALIZADO = `lower(translate("nombre", '${CON_ACENTO}', '${SIN_ACENTO}'))`;

/** Same normalisation, in the application, for the text searched. */
const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** `%`, `_` and `\` in user text must match literally inside LIKE. */
const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);

/** Accent-insensitive name order; ties by exact name and id so pages and limits are deterministic. */
const ORDEN_POR_NOMBRE: Order = [[literal(NOMBRE_NORMALIZADO), 'ASC'], ['nombre', 'ASC'], ['id', 'ASC']];

function aEntidad(modelo: LugarModel): Lugar {
  return {
    id: modelo.id,
    osmTipo: modelo.osmTipo as TipoOsm,
    osmId: modelo.osmId === null ? null : Number(modelo.osmId),
    nombre: modelo.nombre,
    direccion: modelo.direccion,
    latitud: Number(modelo.latitud),
    longitud: Number(modelo.longitud),
    categoria: modelo.categoria as CategoriaLugar,
    saturacionActual: modelo.saturacionActual as NivelSaturacion | null,
    saturacionActualizadaEn: modelo.saturacionActualizadaEn,
    horarioAtencion: modelo.horarioAtencion,
    horaApertura: modelo.horaApertura,
    horaCierre: modelo.horaCierre,
    urlFoto: modelo.urlFoto,
    createdAt: modelo.createdAt,
    updatedAt: modelo.updatedAt,
  };
}

function condicionBbox(bbox: NonNullable<FiltroExploracion['bbox']>): WhereOptions[] {
  return [
    { latitud: { [Op.between]: [bbox.minLat, bbox.maxLat] } },
    { longitud: { [Op.between]: [bbox.minLng, bbox.maxLng] } },
  ];
}

/**
 * Effective level: a stored level older than `vigenteDesde` (or without a timestamp) is SIN_INFORMACION,
 * the same rule the in-memory fake applies.
 */
function condicionNivel(nivel: NonNullable<FiltroLugares['nivel']>, vigenteDesde?: Date): WhereOptions {
  const vencido: WhereOptions = vigenteDesde
    ? { [Op.or]: [{ saturacionActualizadaEn: null }, { saturacionActualizadaEn: { [Op.lt]: vigenteDesde } }] }
    : { [Op.and]: [literal('false')] };
  if (nivel === NivelEfectivo.SIN_INFORMACION) return { [Op.or]: [{ saturacionActual: null }, vencido] };
  const vigente: WhereOptions = vigenteDesde ? { saturacionActualizadaEn: { [Op.gte]: vigenteDesde } } : {};
  return { [Op.and]: [{ saturacionActual: nivel }, vigente] };
}

function condiciones(filtro: Omit<FiltroLugares, 'limite'>): WhereOptions[] {
  const lista: WhereOptions[] = [];
  if (filtro.q !== undefined) lista.push(where(literal(NOMBRE_NORMALIZADO), Op.like, `%${escaparLike(normalizar(filtro.q))}%`));
  if (filtro.bbox) lista.push(...condicionBbox(filtro.bbox));
  if (filtro.categoria) lista.push({ categoria: filtro.categoria });
  if (filtro.nivel) lista.push(condicionNivel(filtro.nivel, filtro.vigenteDesde));
  return lista;
}

/**
 * Pattern: DAO (Sequelize implementation). The only place that knows how `lugar` is persisted.
 * Search is a plain WHERE over the lat/lng index (no PostGIS); text matching is accent- and case-insensitive.
 */
export class LugarDAOSequelize implements LugarDAO {
  async buscarPorId(id: number, tx?: ContextoTx): Promise<Lugar | null> {
    const modelo = await LugarModel.findByPk(id, { transaction: aTransaccion(tx) });
    return modelo ? aEntidad(modelo) : null;
  }

  async buscarPorIds(ids: readonly number[], tx?: ContextoTx): Promise<Lugar[]> {
    if (ids.length === 0) return [];
    const modelos = await LugarModel.findAll({ where: { id: [...new Set(ids)] }, transaction: aTransaccion(tx) });
    return modelos.map(aEntidad);
  }

  async buscar(filtro: FiltroLugares, tx?: ContextoTx): Promise<Lugar[]> {
    const modelos = await LugarModel.findAll({
      where: { [Op.and]: condiciones(filtro) },
      order: ORDEN_POR_NOMBRE,
      limit: filtro.limite,
      transaction: aTransaccion(tx),
    });
    return modelos.map(aEntidad);
  }

  /** TODO(M3): delegate to `lugar/filtroExploracion` once that module exists; until then the same WHERE, without limit. */
  async explorar(filtro: FiltroExploracion, tx?: ContextoTx): Promise<Lugar[]> {
    const modelos = await LugarModel.findAll({
      where: { [Op.and]: condiciones(filtro) },
      order: ORDEN_POR_NOMBRE,
      transaction: aTransaccion(tx),
    });
    return modelos.map(aEntidad);
  }

  async contarPorCategoria(tx?: ContextoTx): Promise<ConteoCategoria[]> {
    const filas = (await LugarModel.findAll({
      attributes: ['categoria', [fn('count', literal('*')), 'total']],
      group: ['categoria'],
      raw: true,
      transaction: aTransaccion(tx),
    })) as unknown as { categoria: CategoriaLugar; total: string }[];
    const totales = new Map(filas.map((fila) => [fila.categoria, Number(fila.total)]));
    return Object.values(CategoriaLugar).map((categoria) => ({ categoria, total: totales.get(categoria) ?? 0 }));
  }

  async actualizarSaturacion(
    id: number,
    nivel: NivelSaturacion | null,
    actualizadaEn: Date,
    tx?: ContextoTx,
  ): Promise<Lugar | null> {
    const [filas] = await LugarModel.update(
      { saturacionActual: nivel, saturacionActualizadaEn: actualizadaEn },
      { where: { id }, transaction: aTransaccion(tx) },
    );
    return filas > 0 ? this.buscarPorId(id, tx) : null;
  }
}
