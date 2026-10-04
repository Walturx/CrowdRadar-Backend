import type { ConteoCategoria, FiltroExploracion, LugarDAO } from '../../dao/LugarDAO.js';
import { nivelEfectivo } from '../../entity/nivelEfectivo.js';
import { bboxAlrededor, distanciaMetros, type Punto } from '../../util/geo.js';
import type { Reloj } from '../../util/Reloj.js';
import type { ConsultaExploracion, ExploracionService, LugarExplorado } from '../ExploracionService.js';
import { MS_POR_MINUTO } from '../../util/tiempo.js';


export interface DependenciasExploracionService {
  lugarDAO: Pick<LugarDAO, 'explorar' | 'contarPorCategoria'>;
  reloj: Reloj;
  /** SATURACION_VENTANA_MIN: how long a reading stays valid. */
  ventanaSaturacionMin: number;
  /** LUGARES_LIMITE_MAX: how many candidates the DAO may return; the caller's `limite` cuts the final list. */
  limiteMax: number;
}

/**
 * Pattern: Service layer. Pipeline: category and bbox in the database -> exact distance -> effective level -> order
 * by distance -> cut. Level and distance are applied here because "effective" depends on the clock and the
 * radius is a circle, not the box the DAO filters with.
 */
export class ExploracionServiceImpl implements ExploracionService {
  constructor(private readonly deps: DependenciasExploracionService) {}

  async explorar({ categoria, nivel, lat, lng, radioKm, limite }: ConsultaExploracion): Promise<LugarExplorado[]> {
    const centro: Punto | null = lat !== undefined && lng !== undefined ? { lat, lng } : null;
    const filtro: FiltroExploracion = {
      ...(categoria ? { categoria } : {}),
      ...(centro ? { bbox: bboxAlrededor(centro, radioKm) } : {}),
      limite: this.deps.limiteMax,
    };
    const lugares = await this.deps.lugarDAO.explorar(filtro);
    const vigenteDesde = new Date(this.deps.reloj.ahora().getTime() - this.deps.ventanaSaturacionMin * MS_POR_MINUTO);
    const encontrados = lugares
      .map((lugar) => ({
        lugar,
        nivel: nivelEfectivo(lugar, vigenteDesde),
        distanciaMetros: centro ? distanciaMetros(centro, { lat: lugar.latitud, lng: lugar.longitud }) : null,
      }))
      .filter((r) => (nivel === undefined || r.nivel === nivel) && (r.distanciaMetros === null || r.distanciaMetros <= radioKm * 1000));
    // Array.prototype.sort is stable: equal distances keep the DAO order (by name).
    if (centro) encontrados.sort((a, b) => (a.distanciaMetros ?? 0) - (b.distanciaMetros ?? 0));
    return encontrados.slice(0, limite);
  }

  listarCategorias(): Promise<ConteoCategoria[]> {
    return this.deps.lugarDAO.contarPorCategoria();
  }
}
