import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { AportesUsuario } from '../entity/puntaje.js';
import type { ReglaEstadoValidacion } from '../pattern/strategy/confiabilidad/derivarEstadoValidacion.js';

/**
 * Pattern: DAO (port, read model). Owner: M5. Reads what users' points are made of from `reporte_saturacion` and
 * `validacion_reporte`; nothing is stored (CRO-72). A report counts only while it is ACTIVO, and its validation state is
 * the one `estadoValidacionPorConteo` gives for its votes under `regla` (every vote weighs 1): VALIDADO from
 * `max(minVotos, minVotosEstado)` votes and a rounded percentage >= `umbralAlta`, RECHAZADO from the same votes and a
 * percentage < `umbralMedia`. ELIMINADO, EN_VALIDACION and SIN_VALIDACIONES reports count for nobody.
 * Each call is one read whatever the number of ids, so a page of users never turns into N+1.
 */
export interface PuntajeDAO {
  /**
   * Per user: own ACTIVO reports that are VALIDADO, and votes whose `tipo_accion` matches the state of an ACTIVO report
   * (CONFIRMAR-VALIDADO, RECHAZAR-RECHAZADO). One entry per distinct id, zeros included. No ids: no read.
   */
  contarAportes(usuarioIds: readonly number[], regla: ReglaEstadoValidacion, tx?: ContextoTx): Promise<Map<number, AportesUsuario>>;
  /** The ids among `reporteIds` of ACTIVO reports whose validation state is VALIDADO, each once, in no particular order. No ids: no read. */
  listarValidados(reporteIds: readonly number[], regla: ReglaEstadoValidacion, tx?: ContextoTx): Promise<number[]>;
}
