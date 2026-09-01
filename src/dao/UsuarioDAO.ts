import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { Usuario } from '../entity/Usuario.js';

/**
 * Pattern: DAO (port). Persistence contract for `usuario`; implementations live in
 * dao/impl. Only the lookup `autenticar` needs exists so far; BE-05a adds the rest
 * of the design's methods (buscarPorEmail, crear, actualizarPerfil, ...).
 */
export interface UsuarioDAO {
  buscarPorId(id: number, tx?: ContextoTx): Promise<Usuario | null>;
}
