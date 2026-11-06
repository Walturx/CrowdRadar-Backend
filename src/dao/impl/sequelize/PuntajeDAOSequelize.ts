import { QueryTypes, type Transaction } from 'sequelize';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import type { AportesUsuario } from '../../../entity/puntaje.js';
import { EstadoReporte } from '../../../enum/EstadoReporte.js';
import { EstadoValidacion } from '../../../enum/EstadoValidacion.js';
import { TipoAccionValidacion } from '../../../enum/TipoAccionValidacion.js';
import type { ReglaEstadoValidacion } from '../../../pattern/strategy/confiabilidad/derivarEstadoValidacion.js';
import type { PuntajeDAO } from '../../PuntajeDAO.js';
import { ReporteModel } from './model/ReporteModel.js';

const aTransaccion = (tx?: ContextoTx) => tx as unknown as Transaction | undefined;

/**
 * SQL twin of `estadoValidacionPorConteo`: the validation state of a report with `votos` votes of which `confirmaciones`
 * confirm, as 'VALIDADO', 'RECHAZADO' or NULL (still EN_VALIDACION, or no votes). Same exact percentage
 * (`ROUND(10000 * c / n) / 100` on numeric, half up like `Math.round` on these non-negative values) and the same order
 * of checks; the thresholds come in as the replacements :minVotos, :minVotosEstado, :umbralAlta and :umbralMedia, never
 * as a second copy of the configuration. Exported so a test can compare both rules on any counts.
 */
export function sqlEstadoValidacion(votos: string, confirmaciones: string): string {
  const porcentaje = `ROUND(10000.0 * ${confirmaciones} / NULLIF(${votos}, 0)) / 100`;
  return `CASE
      WHEN ${votos} < :minVotos OR ${votos} < :minVotosEstado THEN NULL
      WHEN ${porcentaje} >= :umbralAlta THEN '${EstadoValidacion.VALIDADO}'
      WHEN ${porcentaje} < :umbralMedia THEN '${EstadoValidacion.RECHAZADO}'
    END`;
}

/** Replacements shared by both queries: the rule plus the enum values the SQL compares with. */
function reemplazosBase(regla: ReglaEstadoValidacion) {
  return {
    minVotos: regla.minVotos,
    minVotosEstado: regla.minVotosEstado,
    umbralAlta: regla.umbralAlta,
    umbralMedia: regla.umbralMedia,
    activo: EstadoReporte.ACTIVO,
    confirmar: TipoAccionValidacion.CONFIRMAR,
    rechazar: TipoAccionValidacion.RECHAZAR,
    validado: EstadoValidacion.VALIDADO,
    rechazado: EstadoValidacion.RECHAZADO,
  };
}

/**
 * Pattern: DAO (Sequelize implementation). One statement per call. `contarAportes` only counts the votes of the ACTIVO
 * reports the users wrote or voted on (ix_reporte_usuario_lugar_fecha and ix_validacion_usuario find them), derives
 * each report's state once and then counts, per user, the VALIDADO reports they wrote and the votes that match.
 */
export class PuntajeDAOSequelize implements PuntajeDAO {
  async contarAportes(usuarioIds: readonly number[], regla: ReglaEstadoValidacion, tx?: ContextoTx): Promise<Map<number, AportesUsuario>> {
    const ids = [...new Set(usuarioIds)];
    const resultado = new Map<number, AportesUsuario>(ids.map((id) => [id, { reportesValidados: 0, votosAcertados: 0 }]));
    if (ids.length === 0) return resultado;
    const filas = await ReporteModel.sequelize!.query<{ usuarioId: number; reportesValidados: number; votosAcertados: number }>(
      `WITH conteo AS (
         SELECT r.id, r.usuario_id, COUNT(*) AS votos, COUNT(*) FILTER (WHERE v.tipo_accion = :confirmar) AS confirmaciones
           FROM reporte_saturacion r
           JOIN validacion_reporte v ON v.reporte_id = r.id
          WHERE r.estado = :activo
            AND (r.usuario_id IN (:ids) OR r.id IN (SELECT reporte_id FROM validacion_reporte WHERE usuario_id IN (:ids)))
          GROUP BY r.id, r.usuario_id
       ), estado AS (
         SELECT id, usuario_id, ${sqlEstadoValidacion('votos', 'confirmaciones')} AS estado FROM conteo
       )
       SELECT usuario_id AS "usuarioId", SUM(reporte)::int AS "reportesValidados", SUM(voto)::int AS "votosAcertados"
         FROM (
           SELECT e.usuario_id, 1 AS reporte, 0 AS voto
             FROM estado e
            WHERE e.estado = :validado AND e.usuario_id IN (:ids)
           UNION ALL
           SELECT v.usuario_id, 0, 1
             FROM validacion_reporte v
             JOIN estado e ON e.id = v.reporte_id
            WHERE v.usuario_id IN (:ids)
              AND ((e.estado = :validado AND v.tipo_accion = :confirmar) OR (e.estado = :rechazado AND v.tipo_accion = :rechazar))
         ) AS aportes
        GROUP BY usuario_id`,
      { replacements: { ...reemplazosBase(regla), ids }, type: QueryTypes.SELECT, transaction: aTransaccion(tx) },
    );
    for (const fila of filas) {
      resultado.set(Number(fila.usuarioId), { reportesValidados: fila.reportesValidados, votosAcertados: fila.votosAcertados });
    }
    return resultado;
  }

  async listarValidados(reporteIds: readonly number[], regla: ReglaEstadoValidacion, tx?: ContextoTx): Promise<number[]> {
    const ids = [...new Set(reporteIds)];
    if (ids.length === 0) return [];
    const filas = await ReporteModel.sequelize!.query<{ id: number }>(
      `SELECT id FROM (
         SELECT r.id, COUNT(*) AS votos, COUNT(*) FILTER (WHERE v.tipo_accion = :confirmar) AS confirmaciones
           FROM reporte_saturacion r
           JOIN validacion_reporte v ON v.reporte_id = r.id
          WHERE r.estado = :activo AND r.id IN (:ids)
          GROUP BY r.id
       ) AS conteo
       WHERE ${sqlEstadoValidacion('votos', 'confirmaciones')} = :validado`,
      { replacements: { ...reemplazosBase(regla), ids }, type: QueryTypes.SELECT, transaction: aTransaccion(tx) },
    );
    return filas.map((f) => Number(f.id));
  }
}
