import type { Pagina, Paginacion } from '../dao/Paginacion.js';
import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { ReporteSaturacion } from '../entity/ReporteSaturacion.js';
import type { NivelSaturacion } from '../enum/NivelSaturacion.js';

/** A report of the caller together with the name of its place (empty when the place no longer exists). */
export interface ReporteDeUsuario {
  reporte: ReporteSaturacion;
  lugarNombre: string;
}

/**
 * Pattern: Service layer. Report rules without orchestration (the facade orchestrates).
 * Owner: M4. Throws ReporteEnEsperaException (422) inside the cooldown.
 */
export interface ReporteService {
  /** Rejects when the user reported the same place less than COOLDOWN_REPORTE_MIN ago. */
  validarCooldown(usuarioId: number, lugarId: number, tx: ContextoTx): Promise<void>;
  crear(usuarioId: number, lugarId: number, nivel: NivelSaturacion, tx: ContextoTx): Promise<ReporteSaturacion>;
  /** The caller's own reports, newest first, one page at a time. */
  listarMios(usuarioId: number, paginacion: Paginacion): Promise<Pagina<ReporteDeUsuario>>;
}
