import type { FavoritoDAO } from '../../dao/FavoritoDAO.js';
import type { LugarDAO } from '../../dao/LugarDAO.js';
import type { ReporteDAO } from '../../dao/ReporteDAO.js';
import { HorarioAtencion } from '../../entity/HorarioAtencion.js';
import { nivelEfectivo } from '../../entity/nivelEfectivo.js';
import { LugarNoEncontradoException } from '../../exception/lugar/LugarNoEncontradoException.js';
import type { Reloj } from '../../util/Reloj.js';
import type { ConsultaLugares, DetalleLugar, LugarService, ResultadoBusquedaLugar } from '../LugarService.js';
import { MS_POR_MINUTO } from '../../util/tiempo.js';


export interface DependenciasLugarService {
  lugarDAO: LugarDAO;
  /** Only `buscar` is read (esFavorito, alertasActivadas); the favourites stream (M3) owns the port. */
  favoritoDAO: Pick<FavoritoDAO, 'buscar'>;
  /** Only `contarPorLugarDesde` is read; the reports stream (M4) owns the port. */
  reporteDAO: Pick<ReporteDAO, 'contarPorLugarDesde'>;
  reloj: Reloj;
  /** SATURACION_VENTANA_MIN: how long a reading stays valid. */
  ventanaSaturacionMin: number;
  /** ZONA_HORARIA: zone in which `abiertoAhora` is evaluated. */
  zonaHoraria: string;
}

/**
 * Pattern: Service layer. Reads places and turns a null or stale saturation reading into SIN_INFORMACION; it never
 * computes saturation (M4 writes it through LugarDAO.actualizarSaturacion).
 */
export class LugarServiceImpl implements LugarService {
  constructor(private readonly deps: DependenciasLugarService) {}

  async buscar(consulta: ConsultaLugares): Promise<ResultadoBusquedaLugar[]> {
    const vigenteDesde = this.inicioDeVentana();
    const lugares = await this.deps.lugarDAO.buscar({ ...consulta, vigenteDesde });
    return lugares.map((lugar) => ({ lugar, nivel: nivelEfectivo(lugar, vigenteDesde) }));
  }

  async obtenerDetalle(lugarId: number, usuarioId: number): Promise<DetalleLugar> {
    const lugar = await this.deps.lugarDAO.buscarPorId(lugarId);
    if (!lugar) throw new LugarNoEncontradoException();
    const vigenteDesde = this.inicioDeVentana();
    const [reportesRecientes, favorito] = await Promise.all([
      this.deps.reporteDAO.contarPorLugarDesde(lugarId, vigenteDesde),
      this.deps.favoritoDAO.buscar(usuarioId, lugarId),
    ]);
    return {
      lugar,
      nivel: nivelEfectivo(lugar, vigenteDesde),
      reportesRecientes,
      abiertoAhora: HorarioAtencion.desde(lugar).estaAbierto(this.deps.reloj.ahora(), this.deps.zonaHoraria),
      esFavorito: favorito !== null,
      alertasActivadas: favorito?.alertasActivadas ?? false,
    };
  }

  private inicioDeVentana(): Date {
    return new Date(this.deps.reloj.ahora().getTime() - this.deps.ventanaSaturacionMin * MS_POR_MINUTO);
  }
}
