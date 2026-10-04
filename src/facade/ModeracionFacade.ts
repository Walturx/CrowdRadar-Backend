import type { Pagina, Paginacion } from '../dao/Paginacion.js';
import type { FiltroUsuarios } from '../dao/UsuarioDAO.js';
import type { ReporteDenunciado, ResumenMotivo } from '../dao/DenunciaDAO.js';
import type { ReporteSaturacion } from '../entity/ReporteSaturacion.js';
import type { SancionUsuario, DiasSuspension } from '../entity/SancionUsuario.js';
import type { Usuario } from '../entity/Usuario.js';

export type DecisionModeracion = 'ELIMINAR' | 'DESESTIMAR';

export interface DetalleReporteDenunciado {
  reporte: ReporteSaturacion;
  motivos: ResumenMotivo[];
}

/**
 * Pattern: Facade. Admin moderation across UsuarioDAO, SancionDAO, DenunciaDAO, ReporteDAO, KarmaService,
 * SaturacionService, SaturacionSubject, EnviadorCorreo, ConexionBD and Reloj. Owner: M6. Admin routes only.
 * Throws SinDenunciasPendientesException (409), UsuarioYaSuspendidoException (409), UsuarioNoSuspendidoException (409),
 * OperacionNoPermitidaException (422: self, or another ADMIN) and the *NoEncontrado 404s.
 */
export interface ModeracionFacade {
  listarReportesDenunciados(paginacion: Paginacion): Promise<Pagina<ReporteDenunciado>>;
  obtenerReporteDenunciado(reporteId: number): Promise<DetalleReporteDenunciado>;
  /**
   * One transaction: resolve the pending complaints; on ELIMINAR also mark the report ELIMINADO, revoke its karma
   * and recompute the place level. Publishes the level change after the commit.
   */
  resolverDenuncias(adminId: number, reporteId: number, decision: DecisionModeracion, comentario: string | null): Promise<void>;
  listarUsuarios(filtro: FiltroUsuarios, paginacion: Paginacion): Promise<Pagina<Usuario>>;
  obtenerUsuario(usuarioId: number): Promise<Usuario>;
  /** Creates the sanction and sets SUSPENDIDO in one transaction; the notification email is best effort (failure is logged). */
  suspender(adminId: number, usuarioId: number, dias: DiasSuspension, motivo: string): Promise<SancionUsuario>;
  reactivar(adminId: number, usuarioId: number): Promise<void>;
}
