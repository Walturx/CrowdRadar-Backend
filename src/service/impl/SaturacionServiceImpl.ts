import type { LugarDAO } from '../../dao/LugarDAO.js';
import type { ReporteDAO } from '../../dao/ReporteDAO.js';
import type { ContextoTx } from '../../datasource/ConexionBD.js';
import type { Lugar } from '../../entity/Lugar.js';
import { LugarNoEncontradoException } from '../../exception/lugar/LugarNoEncontradoException.js';
import type { EstrategiaSaturacion } from '../../pattern/strategy/saturacion/EstrategiaSaturacion.js';
import type { Reloj } from '../../util/Reloj.js';
import { MS_POR_MINUTO } from '../../util/tiempo.js';
import type { CambioSaturacion, SaturacionService } from '../SaturacionService.js';

export interface DependenciasSaturacionService {
  lugarDAO: LugarDAO;
  reporteDAO: ReporteDAO;
  /** Chosen by the composition root from SATURACION_ESTRATEGIA. */
  estrategia: EstrategiaSaturacion;
  reloj: Reloj;
  ventanaMin: number;
}

/**
 * Pattern: Strategy (context). Reads the recent reports of the place, asks the strategy for the level and stores it
 * (null included) with the current time. It never publishes events: the facade does that after the commit.
 */
export class SaturacionServiceImpl implements SaturacionService {
  constructor(private readonly deps: DependenciasSaturacionService) {}

  async recalcular(lugarId: number, tx: ContextoTx, lugarActual?: Lugar): Promise<CambioSaturacion> {
    const { lugarDAO, reporteDAO, estrategia, reloj, ventanaMin } = this.deps;
    const lugar = lugarActual ?? (await lugarDAO.buscarPorId(lugarId, tx));
    if (!lugar) throw new LugarNoEncontradoException();
    const ahora = reloj.ahora();
    const desde = new Date(ahora.getTime() - ventanaMin * MS_POR_MINUTO);
    const reportes = await reporteDAO.listarRecientesPorLugar(lugarId, desde, tx);
    const nuevo = estrategia.calcular(reportes, ahora);
    await lugarDAO.actualizarSaturacion(lugarId, nuevo, ahora, tx);
    return { lugarId, anterior: lugar.saturacionActual, nuevo, actualizadoEn: ahora };
  }
}
