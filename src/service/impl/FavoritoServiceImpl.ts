import type { FavoritoDAO } from '../../dao/FavoritoDAO.js';
import type { LugarDAO } from '../../dao/LugarDAO.js';
import { nivelEfectivo } from '../../entity/nivelEfectivo.js';
import { FavoritoDuplicadoException } from '../../exception/favorito/FavoritoDuplicadoException.js';
import { FavoritoNoEncontradoException } from '../../exception/favorito/FavoritoNoEncontradoException.js';
import { ConflictoException } from '../../exception/http/ConflictoException.js';
import { LugarNoEncontradoException } from '../../exception/lugar/LugarNoEncontradoException.js';
import type { Reloj } from '../../util/Reloj.js';
import type { FavoritoConLugar, FavoritoService } from '../FavoritoService.js';

const MS_POR_MINUTO = 60_000;

export interface DependenciasFavoritoService {
  favoritoDAO: FavoritoDAO;
  lugarDAO: Pick<LugarDAO, 'buscarPorId' | 'buscarPorIds'>;
  reloj: Reloj;
  /** SATURACION_VENTANA_MIN: how long a reading stays valid. */
  ventanaSaturacionMin: number;
}

/**
 * Pattern: Service layer. Every operation is scoped to the caller. A duplicate is detected by the unique pair in
 * the DAO, so two concurrent requests yield one 201 and one 409, never a generic conflict.
 */
export class FavoritoServiceImpl implements FavoritoService {
  constructor(private readonly deps: DependenciasFavoritoService) {}

  async listar(usuarioId: number): Promise<FavoritoConLugar[]> {
    const favoritos = await this.deps.favoritoDAO.listarPorUsuario(usuarioId);
    const lugares = await this.deps.lugarDAO.buscarPorIds(favoritos.map((f) => f.lugarId));
    const porId = new Map(lugares.map((lugar) => [lugar.id, lugar]));
    const vigenteDesde = this.inicioDeVentana();
    return favoritos.flatMap((favorito) => {
      const lugar = porId.get(favorito.lugarId);
      return lugar ? [{ favorito, lugar, nivel: nivelEfectivo(lugar, vigenteDesde) }] : [];
    });
  }

  async agregar(usuarioId: number, lugarId: number): Promise<FavoritoConLugar> {
    const lugar = await this.deps.lugarDAO.buscarPorId(lugarId);
    if (!lugar) throw new LugarNoEncontradoException();
    try {
      const favorito = await this.deps.favoritoDAO.crear(usuarioId, lugarId);
      return { favorito, lugar, nivel: nivelEfectivo(lugar, this.inicioDeVentana()) };
    } catch (error) {
      if (error instanceof ConflictoException) throw new FavoritoDuplicadoException();
      throw error;
    }
  }

  async eliminar(usuarioId: number, lugarId: number): Promise<void> {
    if (!(await this.deps.favoritoDAO.eliminar(usuarioId, lugarId))) throw new FavoritoNoEncontradoException();
  }

  async configurarAlertas(usuarioId: number, lugarId: number, activadas: boolean): Promise<FavoritoConLugar> {
    const favorito = await this.deps.favoritoDAO.actualizarAlertas(usuarioId, lugarId, activadas);
    const lugar = favorito ? await this.deps.lugarDAO.buscarPorId(lugarId) : null;
    if (!favorito || !lugar) throw new FavoritoNoEncontradoException();
    return { favorito, lugar, nivel: nivelEfectivo(lugar, this.inicioDeVentana()) };
  }

  private inicioDeVentana(): Date {
    return new Date(this.deps.reloj.ahora().getTime() - this.deps.ventanaSaturacionMin * MS_POR_MINUTO);
  }
}
