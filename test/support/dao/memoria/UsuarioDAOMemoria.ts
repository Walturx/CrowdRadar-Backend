import type { UsuarioDAO } from '../../../../src/dao/UsuarioDAO.js';
import type { Usuario } from '../../../../src/entity/Usuario.js';

/** In-memory UsuarioDAO for tests. BE-05a completes it with the rest of the port. */
export class UsuarioDAOMemoria implements UsuarioDAO {
  private readonly filas = new Map<number, Usuario>();
  /** Error to throw from every call, to simulate a database outage. */
  fallo?: Error;

  agregar(usuario: Usuario): Usuario {
    this.filas.set(usuario.id, usuario);
    return usuario;
  }

  async buscarPorId(id: number): Promise<Usuario | null> {
    if (this.fallo) throw this.fallo;
    return this.filas.get(id) ?? null;
  }
}
