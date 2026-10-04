import type { LugarDAO } from './LugarDAO.js';

/**
 * What the alerts need from the places: the display name of each id (the alert list shows it and the observer
 * writes it in the message). Ids that do not exist are simply absent from the map.
 */
export type ResolverNombresLugar = (ids: readonly number[]) => Promise<ReadonlyMap<number, string>>;

/** Adapts any LugarDAO to the narrow resolver, so the stream only depends on the part of the port it uses. */
export function resolverNombresDesde(lugarDAO: Pick<LugarDAO, 'buscarPorIds'>): ResolverNombresLugar {
  return async (ids) => {
    if (ids.length === 0) return new Map();
    const lugares = await lugarDAO.buscarPorIds(ids);
    return new Map(lugares.map((lugar) => [lugar.id, lugar.nombre]));
  };
}
