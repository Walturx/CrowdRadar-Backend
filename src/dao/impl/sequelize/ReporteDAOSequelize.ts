import { Op, QueryTypes, type Transaction, type WhereOptions } from 'sequelize';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import type { ReporteSaturacion } from '../../../entity/ReporteSaturacion.js';
import { EstadoReporte } from '../../../enum/EstadoReporte.js';
import { FiltroDias } from '../../../enum/FiltroDias.js';
import type { MotivoSinPuntos } from '../../../enum/MotivoSinPuntos.js';
import type { NivelSaturacion } from '../../../enum/NivelSaturacion.js';
import { armarPagina, desplazamiento, type Pagina, type Paginacion } from '../../Paginacion.js';
import type { AgregadoHora, ConsultaAgregada, FiltroPendientes, NuevoReporte, ReporteDAO } from '../../ReporteDAO.js';
import { VALOR_NIVEL } from '../../../entity/valorNivel.js';
import { DOMINIO_EMAIL_SINTETICO } from '../../../util/sintetico.js';
import { ReporteModel } from './model/ReporteModel.js';

const aTransaccion = (tx?: ContextoTx) => tx as unknown as Transaction | undefined;

/** Newest first; `id` breaks ties so pages never repeat or lose rows. */
const MAS_NUEVO_PRIMERO: [string, string][] = [
  ['fechaHora', 'DESC'],
  ['id', 'DESC'],
];

/** ISO weekday filter (1 = Monday .. 7 = Sunday) applied in the query zone. */
const FILTRO_SQL_DIAS: Record<FiltroDias, string> = {
  [FiltroDias.TODOS]: '',
  [FiltroDias.LABORABLES]: 'AND EXTRACT(ISODOW FROM fecha_hora AT TIME ZONE :zona) BETWEEN 1 AND 5',
  [FiltroDias.FIN_DE_SEMANA]: 'AND EXTRACT(ISODOW FROM fecha_hora AT TIME ZONE :zona) IN (6, 7)',
};

/** SQL `CASE` that turns `nivel_saturacion` into its number; generated from VALOR_NIVEL so TypeScript and SQL cannot drift. */
export const SQL_VALOR_NIVEL = `CASE nivel_saturacion ${Object.entries(VALOR_NIVEL)
  .map(([nivel, valor]) => `WHEN '${nivel}' THEN ${valor}`)
  .join(' ')} END`;

function aEntidad(modelo: ReporteModel): ReporteSaturacion {
  return {
    id: modelo.id,
    usuarioId: modelo.usuarioId,
    lugarId: modelo.lugarId,
    nivelSaturacion: modelo.nivelSaturacion as NivelSaturacion,
    fechaHora: modelo.fechaHora,
    nivelConfiabilidad: modelo.nivelConfiabilidad === null ? null : Number(modelo.nivelConfiabilidad),
    estado: modelo.estado as EstadoReporte,
    puntosOtorgados: modelo.puntosOtorgados,
    motivoSinPuntos: modelo.motivoSinPuntos as MotivoSinPuntos | null,
    createdAt: modelo.createdAt,
    updatedAt: modelo.updatedAt,
  };
}

/**
 * Pattern: DAO (Sequelize implementation). The only place that knows how `reporte_saturacion` is persisted.
 * `buscarUltimoDeUsuarioEnLugar` takes `pg_advisory_xact_lock(usuarioId, lugarId)`: the lock lives until the
 * caller transaction ends, so two concurrent cooldown checks of the same pair run one after the other and the
 * second one sees the row of the first (a time-based cooldown cannot be a unique index).
 */
export class ReporteDAOSequelize implements ReporteDAO {
  async crear(datos: NuevoReporte, tx?: ContextoTx): Promise<ReporteSaturacion> {
    const modelo = await ReporteModel.create(
      {
        usuarioId: datos.usuarioId,
        lugarId: datos.lugarId,
        nivelSaturacion: datos.nivelSaturacion,
        fechaHora: datos.fechaHora,
      },
      { transaction: aTransaccion(tx) },
    );
    return aEntidad(modelo);
  }

  async buscarPorId(id: number, tx?: ContextoTx): Promise<ReporteSaturacion | null> {
    const modelo = await ReporteModel.findByPk(id, { transaction: aTransaccion(tx) });
    return modelo ? aEntidad(modelo) : null;
  }

  async buscarUltimoDeUsuarioEnLugar(
    usuarioId: number,
    lugarId: number,
    tx?: ContextoTx,
  ): Promise<ReporteSaturacion | null> {
    const transaction = aTransaccion(tx);
    await ReporteModel.sequelize!.query('SELECT pg_advisory_xact_lock(:usuarioId, :lugarId)', {
      replacements: { usuarioId, lugarId },
      type: QueryTypes.SELECT,
      transaction,
    });
    const modelo = await ReporteModel.findOne({ where: { usuarioId, lugarId }, order: MAS_NUEVO_PRIMERO, transaction });
    return modelo ? aEntidad(modelo) : null;
  }

  async listarRecientesPorLugar(lugarId: number, desde: Date, tx?: ContextoTx): Promise<ReporteSaturacion[]> {
    const filas = await ReporteModel.findAll({
      where: { lugarId, fechaHora: { [Op.gte]: desde } },
      order: MAS_NUEVO_PRIMERO,
      transaction: aTransaccion(tx),
    });
    return filas.map(aEntidad);
  }

  contarPorLugarDesde(lugarId: number, desde: Date, tx?: ContextoTx): Promise<number> {
    return ReporteModel.count({
      where: { lugarId, estado: EstadoReporte.ACTIVO, fechaHora: { [Op.gte]: desde } },
      transaction: aTransaccion(tx),
    });
  }

  /**
   * Takes `pg_advisory_xact_lock(usuarioId, 0)` (second key 0: a place id is never 0) before counting, so the daily
   * karma cap is checked one transaction at a time per user, whatever the places they report on.
   */
  async contarPremiadosDeUsuarioDesde(usuarioId: number, desde: Date, tx?: ContextoTx): Promise<number> {
    const transaction = aTransaccion(tx);
    await ReporteModel.sequelize!.query('SELECT pg_advisory_xact_lock(:usuarioId, 0)', {
      replacements: { usuarioId },
      type: QueryTypes.SELECT,
      transaction,
    });
    return ReporteModel.count({
      where: { usuarioId, puntosOtorgados: { [Op.gt]: 0 }, fechaHora: { [Op.gte]: desde } },
      transaction,
    });
  }

  registrarPuntos(reporteId: number, puntos: number, motivo: MotivoSinPuntos | null, tx?: ContextoTx) {
    return this.modificar(reporteId, { puntosOtorgados: puntos, motivoSinPuntos: motivo }, tx);
  }

  listarPorUsuario(usuarioId: number, paginacion: Paginacion, tx?: ContextoTx): Promise<Pagina<ReporteSaturacion>> {
    return this.paginar({ usuarioId }, paginacion, tx);
  }

  actualizarEstado(id: number, estado: EstadoReporte, tx?: ContextoTx) {
    return this.modificar(id, { estado }, tx);
  }

  actualizarConfiabilidad(id: number, nivel: number, tx?: ContextoTx) {
    return this.modificar(id, { nivelConfiabilidad: nivel }, tx);
  }

  async agregarPorHora(consulta: ConsultaAgregada, tx?: ContextoTx): Promise<AgregadoHora[]> {
    const filas = await ReporteModel.sequelize!.query<AgregadoHora>(
      `SELECT to_char(fecha_hora AT TIME ZONE :zona, 'YYYY-MM-DD') AS dia,
              EXTRACT(HOUR FROM fecha_hora AT TIME ZONE :zona)::int AS hora,
              AVG(${SQL_VALOR_NIVEL})::float8 AS promedio,
              COUNT(*)::int AS muestras
         FROM reporte_saturacion
        WHERE lugar_id = :lugarId AND estado = 'ACTIVO' AND fecha_hora >= :desde AND fecha_hora < :hasta
              ${FILTRO_SQL_DIAS[consulta.dias]}
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      {
        replacements: { lugarId: consulta.lugarId, desde: consulta.desde, hasta: consulta.hasta, zona: consulta.zonaHoraria },
        type: QueryTypes.SELECT,
        transaction: aTransaccion(tx),
      },
    );
    return filas.map(({ dia, hora, promedio, muestras }) => ({ dia, hora, promedio, muestras }));
  }

  async hayReportesSinteticos(consulta: ConsultaAgregada, tx?: ContextoTx): Promise<boolean> {
    const [fila] = await ReporteModel.sequelize!.query<{ hay: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM reporte_saturacion r JOIN usuario u ON u.id = r.usuario_id
          WHERE r.lugar_id = :lugarId AND r.estado = 'ACTIVO' AND r.fecha_hora >= :desde AND r.fecha_hora < :hasta
                AND u.email LIKE :patron ${FILTRO_SQL_DIAS[consulta.dias].replaceAll('fecha_hora', 'r.fecha_hora')}
       ) AS hay`,
      {
        replacements: {
          lugarId: consulta.lugarId,
          desde: consulta.desde,
          hasta: consulta.hasta,
          zona: consulta.zonaHoraria,
          patron: `%${DOMINIO_EMAIL_SINTETICO}`,
        },
        type: QueryTypes.SELECT,
        transaction: aTransaccion(tx),
      },
    );
    return fila?.hay === true;
  }

  listarPendientesDeValidar(
    filtro: FiltroPendientes,
    paginacion: Paginacion,
    tx?: ContextoTx,
  ): Promise<Pagina<ReporteSaturacion>> {
    const donde: WhereOptions = {
      usuarioId: { [Op.ne]: filtro.usuarioId },
      estado: EstadoReporte.ACTIVO,
      fechaHora: { [Op.gte]: filtro.desde },
      ...(filtro.lugarIds ? { lugarId: { [Op.in]: [...filtro.lugarIds] } } : {}),
    };
    return this.paginar(donde, paginacion, tx);
  }

  private async paginar(donde: WhereOptions, paginacion: Paginacion, tx?: ContextoTx): Promise<Pagina<ReporteSaturacion>> {
    const { rows, count } = await ReporteModel.findAndCountAll({
      where: donde,
      order: MAS_NUEVO_PRIMERO,
      limit: paginacion.size,
      offset: desplazamiento(paginacion),
      transaction: aTransaccion(tx),
    });
    return armarPagina(rows.map(aEntidad), count, paginacion);
  }

  /** Updates the given columns and reads the row back; null when the report does not exist. */
  private async modificar(id: number, cambios: Partial<ReporteModel>, tx?: ContextoTx): Promise<ReporteSaturacion | null> {
    const [filas] = await ReporteModel.update(cambios, { where: { id }, transaction: aTransaccion(tx) });
    return filas === 0 ? null : this.buscarPorId(id, tx);
  }
}
