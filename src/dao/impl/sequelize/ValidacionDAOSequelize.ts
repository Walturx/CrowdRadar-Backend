import { Op, UniqueConstraintError, type Order, type Transaction } from 'sequelize';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import type { ValidacionReporte } from '../../../entity/ValidacionReporte.js';
import type { TipoAccionValidacion } from '../../../enum/TipoAccionValidacion.js';
import { ConflictoException } from '../../../exception/http/ConflictoException.js';
import type { NuevaValidacion, ValidacionDAO } from '../../ValidacionDAO.js';
import { ValidacionModel } from './model/ValidacionModel.js';

const aTransaccion = (tx?: ContextoTx) => tx as unknown as Transaction | undefined;

/** Oldest first; `id` breaks ties. */
const MAS_ANTIGUO_PRIMERO: Order = [
  ['fechaHora', 'ASC'],
  ['id', 'ASC'],
];

function aEntidad(modelo: ValidacionModel): ValidacionReporte {
  return {
    id: modelo.id,
    reporteId: modelo.reporteId,
    usuarioId: modelo.usuarioId,
    tipoAccion: modelo.tipoAccion as TipoAccionValidacion,
    karmaVotante: modelo.karmaVotante,
    puntosOtorgados: modelo.puntosOtorgados,
    fechaHora: modelo.fechaHora,
    createdAt: modelo.createdAt,
    updatedAt: modelo.updatedAt,
  };
}

/**
 * Pattern: DAO (Sequelize implementation). The only place that knows how `validacion_reporte` is persisted.
 * A second vote of the same user on the same report (uq_validacion_reporte_usuario) surfaces as ConflictoException.
 */
export class ValidacionDAOSequelize implements ValidacionDAO {
  async crear(datos: NuevaValidacion, tx?: ContextoTx): Promise<ValidacionReporte> {
    try {
      const modelo = await ValidacionModel.create(
        {
          reporteId: datos.reporteId,
          usuarioId: datos.usuarioId,
          tipoAccion: datos.tipoAccion,
          karmaVotante: datos.karmaVotante,
          puntosOtorgados: datos.puntosOtorgados,
          fechaHora: datos.fechaHora,
        },
        { transaction: aTransaccion(tx) },
      );
      return aEntidad(modelo);
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw new ConflictoException();
      throw error;
    }
  }

  async buscarPorUsuarioYReporte(usuarioId: number, reporteId: number, tx?: ContextoTx): Promise<ValidacionReporte | null> {
    const modelo = await ValidacionModel.findOne({ where: { usuarioId, reporteId }, transaction: aTransaccion(tx) });
    return modelo ? aEntidad(modelo) : null;
  }

  listarVotos(reporteId: number, tx?: ContextoTx): Promise<ValidacionReporte[]> {
    return this.listarVotosDeReportes([reporteId], tx);
  }

  async listarVotosDeReportes(reporteIds: readonly number[], tx?: ContextoTx): Promise<ValidacionReporte[]> {
    if (reporteIds.length === 0) return [];
    const modelos = await ValidacionModel.findAll({
      where: { reporteId: { [Op.in]: [...reporteIds] } },
      order: MAS_ANTIGUO_PRIMERO,
      transaction: aTransaccion(tx),
    });
    return modelos.map(aEntidad);
  }

  async listarReporteIdsVotadosPor(usuarioId: number, tx?: ContextoTx): Promise<number[]> {
    const modelos = await ValidacionModel.findAll({
      attributes: ['reporteId'],
      where: { usuarioId },
      order: [['reporteId', 'ASC']],
      transaction: aTransaccion(tx),
    });
    return modelos.map((m) => m.reporteId);
  }
}
