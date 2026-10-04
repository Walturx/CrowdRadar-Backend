import { Op, QueryTypes, type Transaction } from 'sequelize';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import type { DispositivoPush } from '../../../entity/DispositivoPush.js';
import type { PlataformaPush } from '../../../enum/PlataformaPush.js';
import type { DispositivoDAO, ResultadoRegistro } from '../../DispositivoDAO.js';
import { DispositivoModel } from './model/DispositivoModel.js';

const aTransaccion = (tx?: ContextoTx) => tx as unknown as Transaction | undefined;

interface FilaRegistro {
  id: number;
  usuario_id: number;
  token_fcm: string;
  plataforma: PlataformaPush;
  created_at: Date;
  updated_at: Date;
  creado: boolean;
}

/**
 * Pattern: DAO (Sequelize implementation). The only place that knows how `dispositivo_push` is persisted.
 * `registrar` is a single atomic upsert on the unique token, so two concurrent registrations of one token
 * leave one row, owned by the last writer.
 */
export class DispositivoDAOSequelize implements DispositivoDAO {
  async registrar(
    usuarioId: number,
    tokenFcm: string,
    plataforma: PlataformaPush,
    tx?: ContextoTx,
  ): Promise<ResultadoRegistro> {
    // `xmax = 0` is true only for a row this statement just inserted: an ON CONFLICT ... DO UPDATE row carries the
    // updating transaction in xmax. It tells a new device (201) from a token that already existed or moved to this
    // user (200) in the same atomic statement, without a read-then-write race. It relies on Postgres internals (it
    // is not a documented guarantee), so the DAO contract test covers both outcomes against a real database.
    const [fila] = await DispositivoModel.sequelize!.query<FilaRegistro>(
      `INSERT INTO dispositivo_push (usuario_id, token_fcm, plataforma)
       VALUES (:usuarioId, :tokenFcm, :plataforma)
       ON CONFLICT (token_fcm) DO UPDATE
         SET usuario_id = EXCLUDED.usuario_id, plataforma = EXCLUDED.plataforma, updated_at = now()
       RETURNING *, (xmax = 0) AS creado`,
      { replacements: { usuarioId, tokenFcm, plataforma }, type: QueryTypes.SELECT, transaction: aTransaccion(tx) },
    );
    const dispositivo: DispositivoPush = {
      id: fila!.id,
      usuarioId: fila!.usuario_id,
      tokenFcm: fila!.token_fcm,
      plataforma: fila!.plataforma,
      createdAt: fila!.created_at,
      updatedAt: fila!.updated_at,
    };
    return { dispositivo, creado: fila!.creado };
  }

  async listarTokensPorUsuario(usuarioId: number, tx?: ContextoTx): Promise<string[]> {
    const modelos = await DispositivoModel.findAll({
      where: { usuarioId },
      order: [['id', 'ASC']],
      transaction: aTransaccion(tx),
    });
    return modelos.map((m) => m.tokenFcm);
  }

  async eliminarPorToken(usuarioId: number, tokenFcm: string, tx?: ContextoTx): Promise<boolean> {
    const filas = await DispositivoModel.destroy({ where: { usuarioId, tokenFcm }, transaction: aTransaccion(tx) });
    return filas > 0;
  }

  async conservarMasRecientes(usuarioId: number, maximo: number, tx?: ContextoTx): Promise<number> {
    const [, filas] = await DispositivoModel.sequelize!.query(
      `DELETE FROM dispositivo_push
        WHERE usuario_id = :usuarioId
          AND id NOT IN (SELECT id FROM dispositivo_push WHERE usuario_id = :usuarioId ORDER BY updated_at DESC, id DESC LIMIT :maximo)`,
      { replacements: { usuarioId, maximo }, transaction: aTransaccion(tx) },
    );
    return (filas as { rowCount?: number }).rowCount ?? 0;
  }

  eliminarTokens(tokens: readonly string[], tx?: ContextoTx): Promise<number> {
    if (tokens.length === 0) return Promise.resolve(0);
    return DispositivoModel.destroy({ where: { tokenFcm: { [Op.in]: [...tokens] } }, transaction: aTransaccion(tx) });
  }
}
