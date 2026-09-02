import type { ConexionBD } from './ConexionBD.js';

/**
 * Pattern: Factory Method.
 *
 * `conectar()` is the template: it asks the subclass for a connection through the
 * protected factory method `crearConexion()` and verifies it before handing it out,
 * so an unreachable database fails at startup. The connection is deliberately NOT a
 * singleton; tests subclass this factory (or use ConexionFalsa) instead of mocking.
 */
export abstract class ConexionFactory {
  protected abstract crearConexion(): ConexionBD | Promise<ConexionBD>;

  async conectar(): Promise<ConexionBD> {
    const conexion = await this.crearConexion();
    try {
      await conexion.verificar();
    } catch (error) {
      // A failure while closing the half-open connection must not mask the original error.
      await conexion.cerrar().catch(() => undefined);
      throw error;
    }
    return conexion;
  }
}
