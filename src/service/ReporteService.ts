import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { ReporteSaturacion } from '../entity/ReporteSaturacion.js';
import type { NivelSaturacion } from '../enum/NivelSaturacion.js';

/**
 * Pattern: Service layer. Report rules without orchestration (the facade orchestrates).
 * Owner: M4. Throws ReporteEnEsperaException (422) inside the cooldown.
 */
export interface ReporteService {
  /** Rejects when the user reported the same place less than COOLDOWN_REPORTE_MIN ago. */
  validarCooldown(usuarioId: number, lugarId: number, tx: ContextoTx): Promise<void>;
  crear(usuarioId: number, lugarId: number, nivel: NivelSaturacion, tx: ContextoTx): Promise<ReporteSaturacion>;
  /** The caller's own reports, newest first. */
  listarMios(usuarioId: number): Promise<ReporteSaturacion[]>;
}
