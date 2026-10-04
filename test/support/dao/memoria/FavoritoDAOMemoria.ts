import type { FavoritoDAO } from '../../../../src/dao/FavoritoDAO.js';
import type { LugarFavorito } from '../../../../src/entity/LugarFavorito.js';
import { ConflictoException } from '../../../../src/exception/http/ConflictoException.js';

const masNuevoPrimero = (a: LugarFavorito, b: LugarFavorito) => b.id - a.id;

/** In-memory FavoritoDAO for tests; behaves like the Sequelize one (shared contract test). */
export class FavoritoDAOMemoria implements FavoritoDAO {
  private readonly filas: LugarFavorito[] = [];
  private siguienteId = 1;

  async crear(usuarioId: number, lugarId: number): Promise<LugarFavorito> {
    if (await this.buscar(usuarioId, lugarId)) throw new ConflictoException();
    const ahora = new Date();
    const favorito: LugarFavorito = {
      id: this.siguienteId++,
      usuarioId,
      lugarId,
      alertasActivadas: true,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.filas.push(favorito);
    return favorito;
  }

  async buscar(usuarioId: number, lugarId: number): Promise<LugarFavorito | null> {
    return this.filas.find((f) => f.usuarioId === usuarioId && f.lugarId === lugarId) ?? null;
  }

  async listarPorUsuario(usuarioId: number): Promise<LugarFavorito[]> {
    return this.filas.filter((f) => f.usuarioId === usuarioId).sort(masNuevoPrimero);
  }

  async eliminar(usuarioId: number, lugarId: number): Promise<boolean> {
    const indice = this.filas.findIndex((f) => f.usuarioId === usuarioId && f.lugarId === lugarId);
    if (indice === -1) return false;
    this.filas.splice(indice, 1);
    return true;
  }

  async actualizarAlertas(usuarioId: number, lugarId: number, activadas: boolean): Promise<LugarFavorito | null> {
    const favorito = await this.buscar(usuarioId, lugarId);
    if (!favorito) return null;
    Object.assign(favorito, { alertasActivadas: activadas, updatedAt: new Date() });
    return favorito;
  }

  async listarConAlertasPorLugar(lugarId: number): Promise<LugarFavorito[]> {
    return this.filas.filter((f) => f.lugarId === lugarId && f.alertasActivadas).sort(masNuevoPrimero);
  }
}
