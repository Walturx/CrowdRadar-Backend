import type { FavoritoDAO } from '../../../../src/dao/FavoritoDAO.js';
import type { LugarFavorito } from '../../../../src/entity/LugarFavorito.js';
import { ConflictoException } from '../../../../src/exception/http/ConflictoException.js';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import type { AlertaDAOMemoria } from './AlertaDAOMemoria.js';
import { copia, exigirReferencia, sellosNuevos, type OpcionesMemoria } from './comun.js';
import type { SembradorMemoria } from './SembradorMemoria.js';

const masNuevoPrimero = (a: LugarFavorito, b: LugarFavorito) => b.id - a.id;

export interface OpcionesFavoritoMemoria extends OpcionesMemoria {
  /** Alerts store that must lose the alerts of a deleted favourite (`ON DELETE CASCADE`). */
  alertas?: AlertaDAOMemoria;
}

/** In-memory FavoritoDAO for tests; behaves like the Sequelize one (shared contract test). */
export class FavoritoDAOMemoria implements FavoritoDAO {
  private readonly filas: LugarFavorito[] = [];
  private siguienteId = 1;
  private readonly reloj: Reloj;
  private readonly sembrador?: SembradorMemoria;
  private readonly alertas?: AlertaDAOMemoria;

  constructor(opciones: OpcionesFavoritoMemoria = {}) {
    this.reloj = opciones.reloj ?? relojSistema;
    this.sembrador = opciones.sembrador;
    this.alertas = opciones.alertas;
  }

  async crear(usuarioId: number, lugarId: number): Promise<LugarFavorito> {
    exigirReferencia(this.sembrador, 'usuario', 'usuario_id', usuarioId, 'lugar_favorito');
    exigirReferencia(this.sembrador, 'lugar', 'lugar_id', lugarId, 'lugar_favorito');
    if (this.encontrar(usuarioId, lugarId)) throw new ConflictoException();
    const favorito: LugarFavorito = {
      id: this.siguienteId++,
      usuarioId,
      lugarId,
      alertasActivadas: true,
      ...sellosNuevos(this.reloj),
    };
    this.filas.push(favorito);
    this.sembrador?.registrar('favorito', favorito.id);
    return copia(favorito);
  }

  async buscar(usuarioId: number, lugarId: number): Promise<LugarFavorito | null> {
    const favorito = this.encontrar(usuarioId, lugarId);
    return favorito ? copia(favorito) : null;
  }

  async listarPorUsuario(usuarioId: number): Promise<LugarFavorito[]> {
    return copia(this.filas.filter((f) => f.usuarioId === usuarioId).sort(masNuevoPrimero));
  }

  async eliminar(usuarioId: number, lugarId: number): Promise<boolean> {
    const indice = this.filas.findIndex((f) => f.usuarioId === usuarioId && f.lugarId === lugarId);
    if (indice === -1) return false;
    const [borrado] = this.filas.splice(indice, 1);
    this.alertas?.eliminarDeFavorito(borrado.id);
    this.sembrador?.olvidar('favorito', borrado.id);
    return true;
  }

  async actualizarAlertas(usuarioId: number, lugarId: number, activadas: boolean): Promise<LugarFavorito | null> {
    const favorito = this.encontrar(usuarioId, lugarId);
    if (!favorito) return null;
    Object.assign(favorito, { alertasActivadas: activadas, updatedAt: this.reloj.ahora() });
    return copia(favorito);
  }

  async listarConAlertasPorLugar(lugarId: number): Promise<LugarFavorito[]> {
    return copia(this.filas.filter((f) => f.lugarId === lugarId && f.alertasActivadas).sort(masNuevoPrimero));
  }

  private encontrar(usuarioId: number, lugarId: number): LugarFavorito | undefined {
    return this.filas.find((f) => f.usuarioId === usuarioId && f.lugarId === lugarId);
  }
}
