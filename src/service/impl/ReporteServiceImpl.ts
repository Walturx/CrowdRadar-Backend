import type { LugarDAO } from '../../dao/LugarDAO.js';
import type { Pagina, Paginacion } from '../../dao/Paginacion.js';
import type { ReporteDAO } from '../../dao/ReporteDAO.js';
import type { ContextoTx } from '../../datasource/ConexionBD.js';
import type { ReporteSaturacion } from '../../entity/ReporteSaturacion.js';
import type { NivelSaturacion } from '../../enum/NivelSaturacion.js';
import { ReporteEnEsperaException } from '../../exception/reporte/ReporteEnEsperaException.js';
import type { Reloj } from '../../util/Reloj.js';
import type { ReporteDeUsuario, ReporteService } from '../ReporteService.js';

const MS_POR_MINUTO = 60_000;

export interface DependenciasReporteService {
  reporteDAO: ReporteDAO;
  lugarDAO: LugarDAO;
  reloj: Reloj;
  cooldownMin: number;
}

/** Pattern: Service layer. Report rules (cooldown, creation); the facade orchestrates them in one transaction. */
export class ReporteServiceImpl implements ReporteService {
  constructor(private readonly deps: DependenciasReporteService) {}

  /** Runs inside the facade transaction: the DAO lookup also takes the (usuario, lugar) lock. */
  async validarCooldown(usuarioId: number, lugarId: number, tx: ContextoTx): Promise<void> {
    const { reporteDAO, reloj, cooldownMin } = this.deps;
    const ultimo = await reporteDAO.buscarUltimoDeUsuarioEnLugar(usuarioId, lugarId, tx);
    if (!ultimo) return;
    const transcurridoMs = reloj.ahora().getTime() - ultimo.fechaHora.getTime();
    const faltanteMs = cooldownMin * MS_POR_MINUTO - transcurridoMs;
    if (faltanteMs <= 0) return;
    throw new ReporteEnEsperaException(Math.min(Math.ceil(faltanteMs / MS_POR_MINUTO), cooldownMin));
  }

  crear(usuarioId: number, lugarId: number, nivel: NivelSaturacion, tx: ContextoTx): Promise<ReporteSaturacion> {
    return this.deps.reporteDAO.crear(
      { usuarioId, lugarId, nivelSaturacion: nivel, fechaHora: this.deps.reloj.ahora() },
      tx,
    );
  }

  async listarMios(usuarioId: number, paginacion: Paginacion): Promise<Pagina<ReporteDeUsuario>> {
    const pagina = await this.deps.reporteDAO.listarPorUsuario(usuarioId, paginacion);
    const lugares = await this.deps.lugarDAO.buscarPorIds(pagina.items.map((r) => r.lugarId));
    const nombres = new Map(lugares.map((l) => [l.id, l.nombre]));
    return { ...pagina, items: pagina.items.map((reporte) => ({ reporte, lugarNombre: nombres.get(reporte.lugarId) ?? '' })) };
  }
}
