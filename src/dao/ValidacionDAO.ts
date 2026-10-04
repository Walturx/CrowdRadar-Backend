import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { ValidacionReporte } from '../entity/ValidacionReporte.js';
import type { TipoAccionValidacion } from '../enum/TipoAccionValidacion.js';

export interface NuevaValidacion {
  reporteId: number;
  usuarioId: number;
  tipoAccion: TipoAccionValidacion;
  /** The voter's karma at vote time. */
  karmaVotante: number;
  puntosOtorgados: number;
  fechaHora: Date;
}

/**
 * Pattern: DAO (port). Persistence contract for `validacion_reporte`. Owner: M5. A user votes
 * once per report: `crear` throws ConflictoException on the second vote (the service maps it
 * to VALIDACION_DUPLICADA).
 */
export interface ValidacionDAO {
  crear(datos: NuevaValidacion, tx?: ContextoTx): Promise<ValidacionReporte>;
  buscarPorUsuarioYReporte(usuarioId: number, reporteId: number, tx?: ContextoTx): Promise<ValidacionReporte | null>;
  /** Every vote on the report, oldest first. */
  listarVotos(reporteId: number, tx?: ContextoTx): Promise<ValidacionReporte[]>;
  /** Every vote on any of the reports, oldest first (one query for a whole page of reports). */
  listarVotosDeReportes(reporteIds: readonly number[], tx?: ContextoTx): Promise<ValidacionReporte[]>;
  /**
   * Points (`puntosOtorgados`) of the votes of the user with fechaHora >= desde (daily validation karma cap). The
   * Sequelize impl takes pg_advisory_xact_lock(usuarioId, 0) first, the same per-user lock as
   * `ReporteDAO.contarPremiadosDeUsuarioDesde`, so cap checks of one user serialize.
   */
  sumarPuntosDelDiaDe(usuarioId: number, desde: Date, tx?: ContextoTx): Promise<number>;
}
