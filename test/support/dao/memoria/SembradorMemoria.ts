import type { Sembrador } from '../../../dao/Sembrador.js';

export interface SembradorMemoria extends Sembrador {
  /** Author of a seeded report: lets in-memory DAOs that join to the report (complaints received) resolve it. */
  autorDe(reporteId: number): number | undefined;
}

/** Sembrador for in-memory DAOs: no FK to satisfy, so it hands out distinct ids and remembers report authors. */
export function crearSembradorMemoria(): SembradorMemoria {
  let ultimo = 1000;
  const autores = new Map<number, number>();
  const siguiente = async () => ++ultimo;
  return {
    usuario: siguiente,
    lugar: siguiente,
    favorito: siguiente,
    async reporte(usuarioId) {
      const id = await siguiente();
      autores.set(id, usuarioId);
      return id;
    },
    autorDe: (reporteId) => autores.get(reporteId),
  };
}
