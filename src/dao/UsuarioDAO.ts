import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { Usuario } from '../entity/Usuario.js';
import type { EstadoCuenta } from '../enum/EstadoCuenta.js';
import type { Pagina, Paginacion } from './Paginacion.js';

/** Data needed to create an account; rol, status and karma take the domain defaults. */
export interface NuevoUsuario {
  nombre: string;
  apellido: string;
  email: string;
  passwordHash: string;
  telefono: string | null;
  distrito: string | null;
}

/** Profile fields a user may change; `null` clears an optional field. */
export interface DatosPerfil {
  nombre?: string;
  apellido?: string;
  telefono?: string | null;
  distrito?: string | null;
}

export type OrdenUsuarios = 'RECIENTES' | 'NOMBRE' | 'KARMA';

/** Admin listing filter (M6): free text over nombre, apellido and email, plus account status. */
export interface FiltroUsuarios {
  q?: string;
  status?: EstadoCuenta;
  orden?: OrdenUsuarios;
}

/**
 * Pattern: DAO (port). Persistence contract for `usuario`; implementations live in
 * dao/impl (Sequelize) and test/support (in-memory). Emails are stored and searched in
 * lowercase. `tx` is the opaque transaction handle of ConexionBD.transaccion.
 */
export interface UsuarioDAO {
  buscarPorId(id: number, tx?: ContextoTx): Promise<Usuario | null>;
  buscarPorEmail(email: string, tx?: ContextoTx): Promise<Usuario | null>;
  /** Throws EmailYaRegistradoException when the email is taken. */
  crear(datos: NuevoUsuario, tx?: ContextoTx): Promise<Usuario>;
  /** Updates only the given fields; null when the user does not exist. */
  actualizarPerfil(id: number, datos: DatosPerfil, tx?: ContextoTx): Promise<Usuario | null>;
  /** True when a row was updated. */
  actualizarPasswordHash(id: number, passwordHash: string, tx?: ContextoTx): Promise<boolean>;
  actualizarStatus(id: number, status: EstadoCuenta, tx?: ContextoTx): Promise<Usuario | null>;
  /** Atomic add (floor 0); returns the new total, or null when the user does not exist. */
  incrementarKarma(id: number, delta: number, tx?: ContextoTx): Promise<number | null>;
  listar(filtro: FiltroUsuarios, paginacion: Paginacion, tx?: ContextoTx): Promise<Pagina<Usuario>>;
}
