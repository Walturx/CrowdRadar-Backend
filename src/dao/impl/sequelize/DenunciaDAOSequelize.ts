import { QueryTypes, UniqueConstraintError, type Transaction } from 'sequelize';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import type { Denuncia } from '../../../entity/Denuncia.js';
import { EstadoDenuncia } from '../../../enum/EstadoDenuncia.js';
import type { MotivoDenuncia } from '../../../enum/MotivoDenuncia.js';
import { ConflictoException } from '../../../exception/http/ConflictoException.js';
import type { DenunciaDAO, NuevaDenuncia, ReporteDenunciado, ResumenMotivo } from '../../DenunciaDAO.js';
import { armarPagina, desplazamiento, type Pagina, type Paginacion } from '../../Paginacion.js';
import { DenunciaModel } from './model/DenunciaModel.js';

const aTransaccion = (tx?: ContextoTx) => tx as unknown as Transaction | undefined;

function aEntidad(modelo: DenunciaModel): Denuncia {
  return {
    id: modelo.id,
    reporteId: modelo.reporteId,
    usuarioId: modelo.usuarioId,
    motivo: modelo.motivo as MotivoDenuncia,
    detalle: modelo.detalle,
    estado: modelo.estado as EstadoDenuncia,
    fechaHora: modelo.fechaHora,
    resueltaPor: modelo.resueltaPor,
    resueltaEn: modelo.resueltaEn,
    createdAt: modelo.createdAt,
    updatedAt: modelo.updatedAt,
  };
}

/**
 * Pattern: DAO (Sequelize implementation). The only place that knows how `denuncia` is persisted.
 * A second complaint of the same user about the same report (uq_denuncia_reporte_usuario) surfaces as ConflictoException.
 */
export class DenunciaDAOSequelize implements DenunciaDAO {
  async crear(datos: NuevaDenuncia, tx?: ContextoTx): Promise<Denuncia> {
    try {
      const modelo = await DenunciaModel.create(
        {
          reporteId: datos.reporteId,
          usuarioId: datos.usuarioId,
          motivo: datos.motivo,
          detalle: datos.detalle,
          fechaHora: datos.fechaHora,
        },
        { transaction: aTransaccion(tx) },
      );
      // `estado` and the resolution columns take the table defaults, so read the stored row back.
      return aEntidad(await modelo.reload({ transaction: aTransaccion(tx) }));
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw new ConflictoException();
      throw error;
    }
  }

  async existe(usuarioId: number, reporteId: number, tx?: ContextoTx): Promise<boolean> {
    return (await DenunciaModel.count({ where: { usuarioId, reporteId }, transaction: aTransaccion(tx) })) > 0;
  }

  async listarReportesConPendientes(paginacion: Paginacion, tx?: ContextoTx): Promise<Pagina<ReporteDenunciado>> {
    const transaction = aTransaccion(tx);
    const sequelize = DenunciaModel.sequelize!;
    const desde = desplazamiento(paginacion);
    // One statement: the window COUNT(*) OVER () runs after GROUP BY, so it counts reports, not complaints.
    const filas = await sequelize.query<{ reporteId: number; pendientes: number; ultimaDenunciaEn: Date; total: number }>(
      `SELECT reporte_id AS "reporteId", COUNT(*)::int AS pendientes, MAX(fecha_hora) AS "ultimaDenunciaEn",
              (COUNT(*) OVER ())::int AS total
         FROM denuncia WHERE estado = :pendiente
        GROUP BY reporte_id
        ORDER BY pendientes DESC, "ultimaDenunciaEn" DESC, reporte_id DESC
        LIMIT :limite OFFSET :desde`,
      {
        replacements: { pendiente: EstadoDenuncia.PENDIENTE, limite: paginacion.size, desde },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    const items = filas.map((f) => ({
      reporteId: f.reporteId,
      pendientes: f.pendientes,
      ultimaDenunciaEn: new Date(f.ultimaDenunciaEn),
    }));
    // A page past the end has no row to carry the total: only then is it counted apart.
    const total = filas[0]?.total ?? (desde === 0 ? 0 : await this.contarReportesConPendientes(transaction));
    return armarPagina(items, total, paginacion);
  }

  private async contarReportesConPendientes(transaction?: Transaction): Promise<number> {
    const [conteo] = await DenunciaModel.sequelize!.query<{ total: number }>(
      'SELECT COUNT(DISTINCT reporte_id)::int AS total FROM denuncia WHERE estado = :pendiente',
      { replacements: { pendiente: EstadoDenuncia.PENDIENTE }, type: QueryTypes.SELECT, transaction },
    );
    return conteo?.total ?? 0;
  }

  async resumirMotivos(reporteId: number, tx?: ContextoTx): Promise<ResumenMotivo[]> {
    return DenunciaModel.sequelize!.query<ResumenMotivo>(
      `SELECT motivo, COUNT(*)::int AS total FROM denuncia
        WHERE reporte_id = :reporteId AND estado = :pendiente
        GROUP BY motivo ORDER BY total DESC, motivo ASC`,
      {
        replacements: { reporteId, pendiente: EstadoDenuncia.PENDIENTE },
        type: QueryTypes.SELECT,
        transaction: aTransaccion(tx),
      },
    );
  }

  async resolverPendientes(
    reporteId: number,
    estado: EstadoDenuncia,
    resueltaPor: number,
    resueltaEn: Date,
    tx?: ContextoTx,
  ): Promise<number> {
    const [filas] = await DenunciaModel.update(
      { estado, resueltaPor, resueltaEn },
      { where: { reporteId, estado: EstadoDenuncia.PENDIENTE }, transaction: aTransaccion(tx) },
    );
    return filas;
  }

  async contarRecibidasPorAutor(autorId: number, tx?: ContextoTx): Promise<number> {
    const [fila] = await DenunciaModel.sequelize!.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM denuncia d JOIN reporte_saturacion r ON r.id = d.reporte_id
        WHERE r.usuario_id = :autorId`,
      { replacements: { autorId }, type: QueryTypes.SELECT, transaction: aTransaccion(tx) },
    );
    return fila?.total ?? 0;
  }
}
