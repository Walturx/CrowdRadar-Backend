import type { Transaction } from 'sequelize';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import type { Alerta } from '../../../entity/Alerta.js';
import type { NivelSaturacion } from '../../../enum/NivelSaturacion.js';
import type { AlertaDAO, NuevaAlerta } from '../../AlertaDAO.js';
import { armarPagina, desplazamiento, type Pagina, type Paginacion } from '../../Paginacion.js';
import { AlertaModel } from './model/AlertaModel.js';

const aTransaccion = (tx?: ContextoTx) => tx as unknown as Transaction | undefined;

function aEntidad(modelo: AlertaModel): Alerta {
  return {
    id: modelo.id,
    favoritoId: modelo.favoritoId,
    usuarioId: modelo.usuarioId,
    lugarId: modelo.lugarId,
    nivelAnterior: modelo.nivelAnterior as NivelSaturacion | null,
    nivelNuevo: modelo.nivelNuevo as NivelSaturacion,
    mensaje: modelo.mensaje,
    leida: modelo.leida,
    fechaHora: modelo.fechaHora,
    createdAt: modelo.createdAt,
    updatedAt: modelo.updatedAt,
  };
}

/** Pattern: DAO (Sequelize implementation). The only place that knows how `alerta` is persisted; reads are scoped to the owner. */
export class AlertaDAOSequelize implements AlertaDAO {
  async crear(datos: NuevaAlerta, tx?: ContextoTx): Promise<Alerta> {
    return aEntidad(await AlertaModel.create({ ...datos }, { transaction: aTransaccion(tx) }));
  }

  async listarPorUsuario(usuarioId: number, paginacion: Paginacion, tx?: ContextoTx): Promise<Pagina<Alerta>> {
    const { rows, count } = await AlertaModel.findAndCountAll({
      where: { usuarioId },
      order: [
        ['fechaHora', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: paginacion.size,
      offset: desplazamiento(paginacion),
      transaction: aTransaccion(tx),
    });
    return armarPagina(rows.map(aEntidad), count, paginacion);
  }

  async marcarLeida(id: number, usuarioId: number, tx?: ContextoTx): Promise<Alerta | null> {
    const [, filas] = await AlertaModel.update(
      { leida: true },
      { where: { id, usuarioId }, returning: true, transaction: aTransaccion(tx) },
    );
    return filas[0] ? aEntidad(filas[0]) : null;
  }

  contarNoLeidas(usuarioId: number, tx?: ContextoTx): Promise<number> {
    return AlertaModel.count({ where: { usuarioId, leida: false }, transaction: aTransaccion(tx) });
  }
}
