import { UniqueConstraintError, type Order, type Transaction } from 'sequelize';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import type { LugarFavorito } from '../../../entity/LugarFavorito.js';
import { ConflictoException } from '../../../exception/http/ConflictoException.js';
import type { FavoritoDAO } from '../../FavoritoDAO.js';
import { FavoritoModel } from './model/FavoritoModel.js';

const aTransaccion = (tx?: ContextoTx) => tx as unknown as Transaction | undefined;

const MAS_NUEVO_PRIMERO: Order = [
  ['createdAt', 'DESC'],
  ['id', 'DESC'],
];

function aEntidad(modelo: FavoritoModel): LugarFavorito {
  return {
    id: modelo.id,
    usuarioId: modelo.usuarioId,
    lugarId: modelo.lugarId,
    alertasActivadas: modelo.alertasActivadas,
    createdAt: modelo.createdAt,
    updatedAt: modelo.updatedAt,
  };
}

/**
 * Pattern: DAO (Sequelize implementation). The only place that knows how `lugar_favorito` is persisted.
 * A duplicate (usuario, lugar) pair surfaces as ConflictoException; foreign-key violations stay Sequelize's own.
 */
export class FavoritoDAOSequelize implements FavoritoDAO {
  async crear(usuarioId: number, lugarId: number, tx?: ContextoTx): Promise<LugarFavorito> {
    try {
      return aEntidad(await FavoritoModel.create({ usuarioId, lugarId }, { transaction: aTransaccion(tx) }));
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw new ConflictoException();
      throw error;
    }
  }

  async buscar(usuarioId: number, lugarId: number, tx?: ContextoTx): Promise<LugarFavorito | null> {
    const modelo = await FavoritoModel.findOne({ where: { usuarioId, lugarId }, transaction: aTransaccion(tx) });
    return modelo ? aEntidad(modelo) : null;
  }

  async listarPorUsuario(usuarioId: number, tx?: ContextoTx): Promise<LugarFavorito[]> {
    const modelos = await FavoritoModel.findAll({
      where: { usuarioId },
      order: MAS_NUEVO_PRIMERO,
      transaction: aTransaccion(tx),
    });
    return modelos.map(aEntidad);
  }

  async eliminar(usuarioId: number, lugarId: number, tx?: ContextoTx): Promise<boolean> {
    const filas = await FavoritoModel.destroy({ where: { usuarioId, lugarId }, transaction: aTransaccion(tx) });
    return filas > 0;
  }

  async actualizarAlertas(
    usuarioId: number,
    lugarId: number,
    activadas: boolean,
    tx?: ContextoTx,
  ): Promise<LugarFavorito | null> {
    const [, filas] = await FavoritoModel.update(
      { alertasActivadas: activadas },
      { where: { usuarioId, lugarId }, returning: true, transaction: aTransaccion(tx) },
    );
    return filas[0] ? aEntidad(filas[0]) : null;
  }

  async listarConAlertasPorLugar(lugarId: number, tx?: ContextoTx): Promise<LugarFavorito[]> {
    const modelos = await FavoritoModel.findAll({
      where: { lugarId, alertasActivadas: true },
      order: MAS_NUEVO_PRIMERO,
      transaction: aTransaccion(tx),
    });
    return modelos.map(aEntidad);
  }
}
