import type { NuevoTokenRecuperacion, TokenRecuperacionDAO } from '../../../../src/dao/TokenRecuperacionDAO.js';
import type { TokenRecuperacion } from '../../../../src/entity/TokenRecuperacion.js';

/** In-memory TokenRecuperacionDAO for tests; behaves like the Sequelize one (shared contract test). */
export class TokenRecuperacionDAOMemoria implements TokenRecuperacionDAO {
  private readonly filas: TokenRecuperacion[] = [];

  async crear(datos: NuevoTokenRecuperacion): Promise<TokenRecuperacion> {
    const ahora = new Date();
    const token: TokenRecuperacion = { ...datos, id: this.filas.length + 1, usadoEn: null, createdAt: ahora, updatedAt: ahora };
    this.filas.push(token);
    return token;
  }

  async buscarPorHash(tokenHash: string): Promise<TokenRecuperacion | null> {
    return this.filas.find((t) => t.tokenHash === tokenHash) ?? null;
  }

  async marcarUsado(id: number, usadoEn: Date): Promise<boolean> {
    const token = this.filas.find((t) => t.id === id);
    if (!token) return false;
    Object.assign(token, { usadoEn, updatedAt: new Date() });
    return true;
  }

  async invalidarVigentesDeUsuario(usuarioId: number, ahora: Date): Promise<number> {
    const vigentes = this.filas.filter((t) => t.usuarioId === usuarioId && t.usadoEn === null);
    for (const t of vigentes) Object.assign(t, { usadoEn: ahora, updatedAt: new Date() });
    return vigentes.length;
  }
}
