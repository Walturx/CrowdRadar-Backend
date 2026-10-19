import type { AutorReporte } from '../dao/ContextoReporteDAO.js';
import type { ReporteDenunciado, ResumenMotivo } from '../dao/DenunciaDAO.js';
import type { Pagina, Paginacion } from '../dao/Paginacion.js';
import type { FiltroUsuarios } from '../dao/UsuarioDAO.js';
import type { Lugar } from '../entity/Lugar.js';
import type { ReporteSaturacion } from '../entity/ReporteSaturacion.js';
import type { DiasSuspension, SancionUsuario } from '../entity/SancionUsuario.js';
import type { Usuario } from '../entity/Usuario.js';
import type { EstadoReporte } from '../enum/EstadoReporte.js';

/** MANTENER keeps the report (complaints DESESTIMADA); ELIMINAR removes it (complaints PROCEDENTE). */
export type DecisionModeracion = 'MANTENER' | 'ELIMINAR';

/** One row of the review queue: the complaint summary with the report, its place and its author. */
export interface ReporteDenunciadoItem extends ReporteDenunciado {
  reporte: ReporteSaturacion;
  lugar: Lugar;
  autor: AutorReporte;
}

export interface DetalleReporteDenunciado {
  reporte: ReporteSaturacion;
  lugar: Lugar;
  autor: AutorReporte;
  /** PENDIENTE complaints (the sum of `motivos`). */
  pendientes: number;
  motivos: ResumenMotivo[];
}

export interface ResultadoResolucion {
  reporteId: number;
  /** State of the report after the decision. */
  estado: EstadoReporte;
  /** Complaints that were resolved. */
  denunciasResueltas: number;
}

/** A user of the admin directory; `sancionVigente` is set only while suspended (its `fechaFin` feeds "faltan N días"). */
export interface UsuarioModerado {
  usuario: Usuario;
  sancionVigente: SancionUsuario | null;
}

export interface DetalleUsuarioModerado extends UsuarioModerado {
  reportesPublicados: number;
  reportesDenunciados: number;
}

/**
 * Pattern: Facade. Admin moderation across UsuarioDAO, SancionDAO, DenunciaDAO, ReporteDAO, LugarDAO, KarmaService,
 * SaturacionService, SaturacionSubject, EnviadorCorreo, ConexionBD and Reloj. Owner: M6. Admin routes only.
 * Throws SinDenunciasPendientesException (409), UsuarioYaSuspendidoException (409), UsuarioNoSuspendidoException (409),
 * OperacionNoPermitidaException (422: self, or another ADMIN), ValidacionException (400: days outside the configured set)
 * and the *NoEncontrado 404s.
 */
export interface ModeracionFacade {
  listarReportesDenunciados(paginacion: Paginacion): Promise<Pagina<ReporteDenunciadoItem>>;
  obtenerReporteDenunciado(reporteId: number): Promise<DetalleReporteDenunciado>;
  /**
   * One transaction: resolve the pending complaints; on ELIMINAR also mark the report ELIMINADO, revoke its karma
   * and recompute the place level. Publishes the level change after the commit.
   */
  resolverDenuncias(adminId: number, reporteId: number, decision: DecisionModeracion, comentario: string | null): Promise<ResultadoResolucion>;
  listarUsuarios(filtro: FiltroUsuarios, paginacion: Paginacion): Promise<Pagina<UsuarioModerado>>;
  obtenerUsuario(usuarioId: number): Promise<DetalleUsuarioModerado>;
  /** Creates the sanction and sets SUSPENDIDO in one transaction; the notification email is best effort (failure is logged). */
  suspender(adminId: number, usuarioId: number, dias: DiasSuspension, motivo: string): Promise<SancionUsuario>;
  reactivar(adminId: number, usuarioId: number): Promise<void>;
}
