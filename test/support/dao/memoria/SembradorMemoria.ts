import type { Sembrador } from '../../../dao/Sembrador.js';

/** Kinds of row other rows may reference with a foreign key. */
export type TipoFilaReferenciada = 'usuario' | 'lugar' | 'favorito';

export interface SembradorMemoria extends Sembrador {
  /** Author of a seeded report: lets in-memory DAOs that join to the report (complaints received) resolve it. */
  autorDe(reporteId: number): number | undefined;
  /** True when a row of that kind was seeded (or registered) and not forgotten since. */
  existe(tipo: TipoFilaReferenciada, id: number): boolean;
  /** Registers a row created outside the sembrador, e.g. a favourite created through FavoritoDAOMemoria. */
  registrar(tipo: TipoFilaReferenciada, id: number): void;
  /** Forgets a deleted row so later references to it violate the FK. */
  olvidar(tipo: TipoFilaReferenciada, id: number): void;
}

/**
 * Sembrador for in-memory DAOs: hands out distinct ids, remembers report authors and keeps the registry that
 * lets DAOs enforce foreign keys (`existe`).
 */
export function crearSembradorMemoria(): SembradorMemoria {
  let ultimo = 1000;
  const autores = new Map<number, number>();
  const filas: Record<TipoFilaReferenciada, Set<number>> = { usuario: new Set(), lugar: new Set(), favorito: new Set() };
  const siguiente = async (tipo?: TipoFilaReferenciada) => {
    const id = ++ultimo;
    if (tipo) filas[tipo].add(id);
    return id;
  };
  return {
    usuario: () => siguiente('usuario'),
    lugar: () => siguiente('lugar'),
    favorito: () => siguiente('favorito'),
    async reporte(usuarioId) {
      const id = await siguiente();
      autores.set(id, usuarioId);
      return id;
    },
    autorDe: (reporteId) => autores.get(reporteId),
    existe: (tipo, id) => filas[tipo].has(id),
    registrar: (tipo, id) => void filas[tipo].add(id),
    olvidar: (tipo, id) => void filas[tipo].delete(id),
  };
}
