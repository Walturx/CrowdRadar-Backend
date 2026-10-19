import { Op, type Transaction } from 'sequelize';
import type { ContextoReporte, ContextoReporteDAO } from '../../ContextoReporteDAO.js';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import { aEntidadLugar } from './LugarDAOSequelize.js';
import { LugarModel } from './model/LugarModel.js';
import { ReporteModel } from './model/ReporteModel.js';
import { UsuarioModel } from './model/UsuarioModel.js';
import { aEntidadReporte } from './ReporteDAOSequelize.js';
import { aEntidadUsuario } from './UsuarioDAOSequelize.js';

/**
 * Pattern: DAO (Sequelize implementation). One `SELECT ... JOIN lugar JOIN usuario WHERE reporte.id IN (...)` for the
 * whole page; the inner joins drop reports whose place or author is gone, as the contract says.
 */
export class ContextoReporteDAOSequelize implements ContextoReporteDAO {
  async buscarPorReportes(reporteIds: readonly number[], tx?: ContextoTx): Promise<ContextoReporte[]> {
    if (reporteIds.length === 0) return [];
    const filas = await ReporteModel.findAll({
      where: { id: { [Op.in]: [...new Set(reporteIds)] } },
      include: [
        { model: LugarModel, as: 'lugar', required: true },
        { model: UsuarioModel, as: 'autor', required: true },
      ],
      transaction: tx as unknown as Transaction | undefined,
    });
    return filas.map((fila) => ({
      reporte: aEntidadReporte(fila),
      lugar: aEntidadLugar(fila.get('lugar') as LugarModel),
      autor: aEntidadUsuario(fila.get('autor') as UsuarioModel),
    }));
  }
}
