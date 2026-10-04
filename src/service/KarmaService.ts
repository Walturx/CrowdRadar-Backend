import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { MotivoSinPuntos } from '../enum/MotivoSinPuntos.js';

export interface ResultadoKarma {
  puntosGanados: number;
  /** The user's total after this operation. */
  total: number;
  motivoSinPuntos: MotivoSinPuntos | null;
}

/**
 * Pattern: Service layer. Karma rules (daily cap, points per report and per vote, revocation).
 * Owner: M4; M5 and M6 call it. Always inside the caller's transaction.
 */
export interface KarmaService {
  /** Awards KARMA_POR_REPORTE unless the daily cap of rewarded reports is reached (then 0 + TOPE_DIARIO). */
  otorgarPorReporte(usuarioId: number, reporteId: number, tx: ContextoTx): Promise<ResultadoKarma>;
  /** Awards KARMA_POR_VALIDACION to the voter; resolves with the points granted (0 when none applies). */
  otorgarPorValidacion(usuarioId: number, tx: ContextoTx): Promise<number>;
  /** Takes back the points of a removed report; the total never goes below 0. */
  revocarPorReporteEliminado(reporteId: number, tx: ContextoTx): Promise<void>;
}
