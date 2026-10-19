import { Op, QueryTypes, UniqueConstraintError, type InferAttributes, type Order, type Transaction, type WhereOptions } from 'sequelize';
import type { ContextoTx } from '../../../datasource/ConexionBD.js';
import type { Usuario } from '../../../entity/Usuario.js';
import type { EstadoCuenta } from '../../../enum/EstadoCuenta.js';
import type { Rol } from '../../../enum/Rol.js';
import { EmailYaRegistradoException } from '../../../exception/usuario/EmailYaRegistradoException.js';
import { armarPagina, desplazamiento, type Pagina, type Paginacion } from '../../Paginacion.js';
import type { DatosPerfil, FiltroUsuarios, NuevoUsuario, OrdenUsuarios, UsuarioDAO } from '../../UsuarioDAO.js';
import { UsuarioModel } from './model/UsuarioModel.js';
import { columnasDe } from './sqlCrudo.js';

const ORDENES: Record<OrdenUsuarios, Order> = {
  RECIENTES: [
    ['createdAt', 'DESC'],
    ['id', 'DESC'],
  ],
  NOMBRE: [
    ['nombre', 'ASC'],
    ['apellido', 'ASC'],
    ['id', 'ASC'],
  ],
  KARMA: [
    ['puntosKarma', 'DESC'],
    ['id', 'ASC'],
  ],
};

const aTransaccion = (tx?: ContextoTx) => tx as unknown as Transaction | undefined;

/** `%`, `_` and `\` in user text must match literally inside ILIKE. */
const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);

/** Accepts a model instance or a `raw: true` row (same attribute names). */
export function aEntidadUsuario(modelo: InferAttributes<UsuarioModel>): Usuario {
  return {
    id: modelo.id,
    nombre: modelo.nombre,
    apellido: modelo.apellido,
    email: modelo.email,
    passwordHash: modelo.passwordHash,
    telefono: modelo.telefono,
    distrito: modelo.distrito,
    rol: modelo.rol as Rol,
    status: modelo.status as EstadoCuenta,
    puntosKarma: modelo.puntosKarma,
    passwordCambiadaEn: modelo.passwordCambiadaEn ?? null,
    createdAt: modelo.createdAt,
    updatedAt: modelo.updatedAt,
  };
}

/**
 * Pattern: DAO (Sequelize implementation). The only place that knows how `usuario` is
 * persisted; it exchanges plain entities with services and never leaks the model.
 */
export class UsuarioDAOSequelize implements UsuarioDAO {
  async buscarPorId(id: number, tx?: ContextoTx): Promise<Usuario | null> {
    // Hand-written SQL (sqlCrudo.ts): every authenticated request reads its user.
    const [fila] = await UsuarioModel.sequelize!.query<InferAttributes<UsuarioModel>>(
      `SELECT ${columnasDe(UsuarioModel)} FROM usuario WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT, transaction: aTransaccion(tx) },
    );
    return fila ? aEntidadUsuario(fila) : null;
  }

  async buscarPorEmail(email: string, tx?: ContextoTx): Promise<Usuario | null> {
    const modelo = await UsuarioModel.findOne({
      where: { email: email.toLowerCase() },
      transaction: aTransaccion(tx),
    });
    return modelo ? aEntidadUsuario(modelo) : null;
  }

  async crear(datos: NuevoUsuario, tx?: ContextoTx): Promise<Usuario> {
    try {
      const modelo = await UsuarioModel.create(
        { ...datos, email: datos.email.toLowerCase() },
        { transaction: aTransaccion(tx) },
      );
      return aEntidadUsuario(modelo);
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw new EmailYaRegistradoException();
      throw error;
    }
  }

  actualizarPerfil(id: number, datos: DatosPerfil, tx?: ContextoTx): Promise<Usuario | null> {
    return this.actualizar(id, datos, tx);
  }

  async actualizarPasswordHash(id: number, passwordHash: string, tx?: ContextoTx): Promise<boolean> {
    const [filas] = await UsuarioModel.update({ passwordHash, passwordCambiadaEn: new Date() }, { where: { id }, transaction: aTransaccion(tx) });
    return filas > 0;
  }

  actualizarStatus(id: number, status: EstadoCuenta, tx?: ContextoTx): Promise<Usuario | null> {
    return this.actualizar(id, { status }, tx);
  }

  async incrementarKarma(id: number, delta: number, tx?: ContextoTx): Promise<number | null> {
    const filas = await UsuarioModel.sequelize!.query<{ puntos_karma: number }>(
      `UPDATE usuario SET puntos_karma = GREATEST(puntos_karma + :delta, 0), updated_at = now()
       WHERE id = :id RETURNING puntos_karma`,
      { replacements: { id, delta }, type: QueryTypes.SELECT, transaction: aTransaccion(tx) },
    );
    return filas[0]?.puntos_karma ?? null;
  }

  async listar(filtro: FiltroUsuarios, paginacion: Paginacion, tx?: ContextoTx): Promise<Pagina<Usuario>> {
    const condiciones: WhereOptions[] = [];
    if (filtro.status) condiciones.push({ status: filtro.status });
    if (filtro.q) {
      const patron = `%${escaparLike(filtro.q)}%`;
      condiciones.push({
        [Op.or]: [{ nombre: { [Op.iLike]: patron } }, { apellido: { [Op.iLike]: patron } }, { email: { [Op.iLike]: patron } }],
      });
    }
    const { rows, count } = await UsuarioModel.findAndCountAll({
      where: { [Op.and]: condiciones },
      order: ORDENES[filtro.orden ?? 'RECIENTES'],
      limit: paginacion.size,
      offset: desplazamiento(paginacion),
      transaction: aTransaccion(tx),
    });
    return armarPagina(rows.map(aEntidadUsuario), count, paginacion);
  }

  /** Updates only the defined fields; reads the row back so callers get the stored state. */
  private async actualizar(id: number, cambios: Partial<DatosPerfil> & { status?: EstadoCuenta }, tx?: ContextoTx) {
    const definidos = Object.fromEntries(Object.entries(cambios).filter(([, valor]) => valor !== undefined));
    if (Object.keys(definidos).length > 0) {
      await UsuarioModel.update(definidos, { where: { id }, transaction: aTransaccion(tx) });
    }
    return this.buscarPorId(id, tx);
  }
}
