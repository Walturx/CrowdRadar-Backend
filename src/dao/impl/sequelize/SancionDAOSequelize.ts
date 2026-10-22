import { Op, type Transaction } from 'sequelize';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import type { DiasSuspension, SancionUsuario } from '../../../entity/SancionUsuario.js';
import type { TipoSancion } from '../../../enum/TipoSancion.js';
import type { NuevaSancion, SancionDAO } from '../../SancionDAO.js';
import { SancionModel } from './model/SancionModel.js';

const aTransaccion = (tx?: ContextoTx) => tx as unknown as Transaction | undefined;

function aEntidad(modelo: SancionModel): SancionUsuario {
  return {
    id: modelo.id,
    usuarioId: modelo.usuarioId,
    administradorId: modelo.administradorId,
    tipo: modelo.tipo as TipoSancion,
    dias: modelo.dias as DiasSuspension,
    motivo: modelo.motivo,
    fechaInicio: modelo.fechaInicio,
    fechaFin: modelo.fechaFin,
    fechaLevantamiento: modelo.fechaLevantamiento,
    levantadaPor: modelo.levantadaPor,
    createdAt: modelo.createdAt,
    updatedAt: modelo.updatedAt,
  };
}

/** Pattern: DAO (Sequelize implementation). The only place that knows how `sancion_usuario` is persisted. */
export class SancionDAOSequelize implements SancionDAO {
  async crear(datos: NuevaSancion, tx?: ContextoTx): Promise<SancionUsuario> {
    const modelo = await SancionModel.create({ ...datos }, { transaction: aTransaccion(tx) });
    // `tipo` takes the table default, so read the stored row back.
    return aEntidad(await modelo.reload({ transaction: aTransaccion(tx) }));
  }

  async buscarVigente(usuarioId: number, ahora: Date, tx?: ContextoTx): Promise<SancionUsuario | null> {
    const modelo = await SancionModel.findOne({
      where: { usuarioId, fechaLevantamiento: null, fechaFin: { [Op.gt]: ahora } },
      order: [['fechaInicio', 'DESC'], ['id', 'DESC']],
      transaction: aTransaccion(tx),
    });
    return modelo ? aEntidad(modelo) : null;
  }

  async levantar(id: number, levantadaPor: number, fecha: Date, tx?: ContextoTx): Promise<SancionUsuario | null> {
    const transaction = aTransaccion(tx);
    const [filas] = await SancionModel.update({ fechaLevantamiento: fecha, levantadaPor }, { where: { id }, transaction });
    if (filas === 0) return null;
    const modelo = await SancionModel.findByPk(id, { transaction });
    return modelo ? aEntidad(modelo) : null;
  }
}
