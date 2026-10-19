import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { Lugar } from '../entity/Lugar.js';
import type { ReporteSaturacion } from '../entity/ReporteSaturacion.js';
import type { Usuario } from '../entity/Usuario.js';
import type { LugarDAO } from './LugarDAO.js';
import type { ReporteDAO } from './ReporteDAO.js';
import type { UsuarioDAO } from './UsuarioDAO.js';

/** What the moderation screens show of a report's author. Never the credentials (`passwordHash`) or the account state. */
export type AutorReporte = Pick<Usuario, 'id' | 'nombre' | 'apellido' | 'email'>;

/** Copies only the AutorReporte fields, so a full Usuario passed in does not leak the rest. */
export const aAutorReporte = ({ id, nombre, apellido, email }: AutorReporte): AutorReporte => ({ id, nombre, apellido, email });

/** A report with its place and its author. */
export interface ContextoReporte {
  reporte: ReporteSaturacion;
  lugar: Lugar;
  autor: AutorReporte;
}

/**
 * Pattern: DAO (port, read model of M6). Reads report, place and author of many reports at once, so a page of the
 * moderation queue costs one read instead of three per item. Reports of any `estado` are returned; a report that does
 * not exist (or whose place or author is gone) is omitted. No order is promised: callers index by `reporte.id`.
 * Owner: M6.
 */
export interface ContextoReporteDAO {
  buscarPorReportes(reporteIds: readonly number[], tx?: ContextoTx): Promise<ContextoReporte[]>;
}

/**
 * Same contract composed from the entity DAOs (one read per report, one batch read of places, one read per author).
 * For compositions without a dedicated implementation, such as the in-memory test containers.
 */
export function contextoReporteDesde(daos: {
  reporteDAO: Pick<ReporteDAO, 'buscarPorId'>;
  lugarDAO: Pick<LugarDAO, 'buscarPorIds'>;
  usuarioDAO: Pick<UsuarioDAO, 'buscarPorId'>;
}): ContextoReporteDAO {
  return {
    async buscarPorReportes(reporteIds, tx) {
      const reportes = (await Promise.all([...new Set(reporteIds)].map((id) => daos.reporteDAO.buscarPorId(id, tx)))).filter(
        (r): r is ReporteSaturacion => r !== null,
      );
      const lugares = new Map((await daos.lugarDAO.buscarPorIds([...new Set(reportes.map((r) => r.lugarId))], tx)).map((l) => [l.id, l]));
      const autores = await Promise.all(reportes.map((r) => daos.usuarioDAO.buscarPorId(r.usuarioId, tx)));
      return reportes.flatMap((reporte, i) => {
        const lugar = lugares.get(reporte.lugarId);
        const autor = autores[i];
        return lugar && autor ? [{ reporte, lugar, autor: aAutorReporte(autor) }] : [];
      });
    },
  };
}
