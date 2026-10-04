import { Op, UniqueConstraintError, type Transaction } from 'sequelize';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import type { TokenRecuperacion } from '../../../entity/TokenRecuperacion.js';
import { ConflictoException } from '../../../exception/http/ConflictoException.js';
import type { NuevoTokenRecuperacion, TokenRecuperacionDAO } from '../../TokenRecuperacionDAO.js';
import { TokenRecuperacionModel } from './model/TokenRecuperacionModel.js';

const aTransaccion = (tx?: ContextoTx) => tx as unknown as Transaction | undefined;

function aEntidad(modelo: TokenRecuperacionModel): TokenRecuperacion {
  return {
    id: modelo.id,
    usuarioId: modelo.usuarioId,
    tokenHash: modelo.tokenHash,
    expiraEn: modelo.expiraEn,
    usadoEn: modelo.usadoEn ?? null,
    createdAt: modelo.createdAt,
    updatedAt: modelo.updatedAt,
  };
}

/**
 * Pattern: DAO (Sequelize implementation). The only place that knows how `token_recuperacion` is persisted.
 * A repeated hash surfaces as ConflictoException; foreign-key violations stay Sequelize's own.
 */
export class TokenRecuperacionDAOSequelize implements TokenRecuperacionDAO {
  async crear(datos: NuevoTokenRecuperacion, tx?: ContextoTx): Promise<TokenRecuperacion> {
    try {
      return aEntidad(await TokenRecuperacionModel.create({ ...datos }, { transaction: aTransaccion(tx) }));
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw new ConflictoException();
      throw error;
    }
  }

  async buscarPorHash(tokenHash: string, tx?: ContextoTx): Promise<TokenRecuperacion | null> {
    const modelo = await TokenRecuperacionModel.findOne({ where: { tokenHash }, transaction: aTransaccion(tx) });
    return modelo ? aEntidad(modelo) : null;
  }

  async marcarUsado(id: number, usadoEn: Date, tx?: ContextoTx): Promise<boolean> {
    const [filas] = await TokenRecuperacionModel.update({ usadoEn }, { where: { id }, transaction: aTransaccion(tx) });
    return filas > 0;
  }

  async limitarVigentes(usuarioId: number, maximo: number, ahora: Date, tx?: ContextoTx): Promise<number> {
    const [, filas] = await TokenRecuperacionModel.sequelize!.query(
      `UPDATE token_recuperacion SET usado_en = :ahora, updated_at = :ahora
        WHERE usuario_id = :usuarioId AND usado_en IS NULL AND expira_en > :ahora
          AND id NOT IN (SELECT id FROM token_recuperacion
                          WHERE usuario_id = :usuarioId AND usado_en IS NULL AND expira_en > :ahora
                          ORDER BY id DESC LIMIT :maximo)`,
      { replacements: { usuarioId, maximo, ahora }, transaction: aTransaccion(tx) },
    );
    return (filas as { rowCount?: number }).rowCount ?? 0;
  }

  async invalidarVigentesDeUsuario(usuarioId: number, ahora: Date, tx?: ContextoTx): Promise<number> {
    const [filas] = await TokenRecuperacionModel.update(
      { usadoEn: ahora },
      { where: { usuarioId, usadoEn: { [Op.is]: null } }, transaction: aTransaccion(tx) },
    );
    return filas;
  }
}
