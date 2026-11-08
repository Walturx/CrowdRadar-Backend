import type { ReporteSaturacion } from '../entity/ReporteSaturacion.js';
import type { Lugar } from '../entity/Lugar.js';
import type { NivelSaturacion } from '../enum/NivelSaturacion.js';

export interface ReporteRegistrado {
  reporte: ReporteSaturacion;
  lugar: Lugar;
}

/**
 * Pattern: Facade. Orchestrates LugarDAO, ReporteService, SaturacionService and the
 * SaturacionSubject in one transaction, without business calculations of its own. Owner: M4.
 * Throws LugarNoEncontradoException (404) and ReporteEnEsperaException (422).
 */
export interface ReporteFacade {
  /**
   * Place check, cooldown, then in one transaction: create the report and recompute saturation. A report earns no
   * points when it is created: points are computed later from its votes (PuntajeService).
   * After the commit, and only when the level changed, publishes SaturacionCambiadaEvento.
   */
  registrar(usuarioId: number, lugarId: number, nivel: NivelSaturacion): Promise<ReporteRegistrado>;
}
