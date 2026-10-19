import type { EnviadorCorreo } from '../../adapter/correo/EnviadorCorreo.js';
import { aAutorReporte, contextoReporteDesde, type ContextoReporteDAO } from '../../dao/ContextoReporteDAO.js';
import type { DenunciaDAO } from '../../dao/DenunciaDAO.js';
import type { LugarDAO } from '../../dao/LugarDAO.js';
import type { Pagina, Paginacion } from '../../dao/Paginacion.js';
import type { ReporteDAO } from '../../dao/ReporteDAO.js';
import type { SancionDAO } from '../../dao/SancionDAO.js';
import type { FiltroUsuarios, UsuarioDAO } from '../../dao/UsuarioDAO.js';
import type { ConexionBD, ContextoTx } from '../../datasource/ConexionBD.js';
import type { DiasSuspension, SancionUsuario } from '../../entity/SancionUsuario.js';
import type { Usuario } from '../../entity/Usuario.js';
import { EstadoCuenta } from '../../enum/EstadoCuenta.js';
import { EstadoDenuncia } from '../../enum/EstadoDenuncia.js';
import { EstadoReporte } from '../../enum/EstadoReporte.js';
import { Rol } from '../../enum/Rol.js';
import { ValidacionException } from '../../exception/http/ValidacionException.js';
import { OperacionNoPermitidaException } from '../../exception/moderacion/OperacionNoPermitidaException.js';
import { SinDenunciasPendientesException } from '../../exception/moderacion/SinDenunciasPendientesException.js';
import { UsuarioNoSuspendidoException } from '../../exception/moderacion/UsuarioNoSuspendidoException.js';
import { UsuarioYaSuspendidoException } from '../../exception/moderacion/UsuarioYaSuspendidoException.js';
import { ReporteNoEncontradoException } from '../../exception/reporte/ReporteNoEncontradoException.js';
import { UsuarioNoEncontradoException } from '../../exception/usuario/UsuarioNoEncontradoException.js';
import { crearEventoSaturacion } from '../../pattern/observer/SaturacionCambiadaEvento.js';
import type { SaturacionSubject } from '../../pattern/observer/SaturacionSubject.js';
import type { KarmaService } from '../../service/KarmaService.js';
import type { SaturacionService } from '../../service/SaturacionService.js';
import type { Logger } from '../../util/logger.js';
import type { Reloj } from '../../util/Reloj.js';
import { MS_POR_DIA } from '../../util/tiempo.js';
import type {
  DecisionModeracion,
  DetalleReporteDenunciado,
  DetalleUsuarioModerado,
  ModeracionFacade,
  ReporteDenunciadoItem,
  ResultadoResolucion,
  UsuarioModerado,
} from '../ModeracionFacade.js';

export interface DependenciasModeracionFacade {
  usuarioDAO: UsuarioDAO;
  sancionDAO: SancionDAO;
  denunciaDAO: DenunciaDAO;
  reporteDAO: ReporteDAO;
  lugarDAO: LugarDAO;
  /** Batch read of report, place and author for the review queue; defaults to composing the three DAOs above. */
  contextoReporteDAO?: ContextoReporteDAO;
  karmaService: KarmaService;
  saturacionService: SaturacionService;
  subject: SaturacionSubject;
  correo: EnviadorCorreo;
  conexion: ConexionBD;
  reloj: Reloj;
  logger: Logger;
  /** SUSPENSION_DIAS_PERMITIDOS: a subset of {3, 7, 30} (the table CHECK). */
  diasPermitidos: readonly number[];
}

const escaparHtml = (texto: string): string =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Pattern: Facade. Admin moderation over ten collaborators so the controller sees seven calls. Each write is one
 * transaction; the mail and the level-change event go out after the commit and never fail the request.
 */
export class ModeracionFacadeImpl implements ModeracionFacade {
  private readonly contextos: ContextoReporteDAO;

  constructor(private readonly deps: DependenciasModeracionFacade) {
    this.contextos = deps.contextoReporteDAO ?? contextoReporteDesde(deps);
  }

  async suspender(adminId: number, usuarioId: number, dias: DiasSuspension, motivo: string): Promise<SancionUsuario> {
    const { usuarioDAO, sancionDAO, conexion, reloj, diasPermitidos } = this.deps;
    if (adminId === usuarioId) throw new OperacionNoPermitidaException('No puedes suspender tu propia cuenta.');
    if (!diasPermitidos.includes(dias)) {
      throw new ValidacionException([{ campo: 'dias', mensaje: `Debe ser uno de: ${diasPermitidos.join(', ')}.` }]);
    }
    const usuario = await usuarioDAO.buscarPorId(usuarioId);
    if (!usuario) throw new UsuarioNoEncontradoException();
    if (usuario.rol === Rol.ADMIN) throw new OperacionNoPermitidaException('No se puede suspender a otro administrador.');

    const inicio = reloj.ahora();
    const sancion = await conexion.transaccion(async (tx) => {
      if (await sancionDAO.buscarVigente(usuarioId, inicio, tx)) throw new UsuarioYaSuspendidoException();
      const creada = await sancionDAO.crear(
        { usuarioId, administradorId: adminId, dias, motivo, fechaInicio: inicio, fechaFin: new Date(inicio.getTime() + dias * MS_POR_DIA) },
        tx,
      );
      await usuarioDAO.actualizarStatus(usuarioId, EstadoCuenta.SUSPENDIDO, tx);
      return creada;
    });
    this.deps.logger.info({ sancionId: sancion.id, usuarioId, adminId, dias }, 'Usuario suspendido');
    await this.avisarSuspension(usuario.email, usuario.nombre, sancion);
    return sancion;
  }

  /** Best effort: the suspension is already committed, so a mail failure is only logged. */
  private async avisarSuspension(para: string, nombre: string, sancion: SancionUsuario): Promise<void> {
    const hasta = sancion.fechaFin.toISOString();
    try {
      await this.deps.correo.enviar({
        para,
        asunto: 'Tu cuenta de CrowdRadar fue suspendida',
        texto: `Hola ${nombre}, tu cuenta está suspendida hasta el ${hasta}. Motivo: ${sancion.motivo}`,
        html: `<p>Hola ${escaparHtml(nombre)}, tu cuenta está suspendida hasta el ${hasta}.</p><p>Motivo: ${escaparHtml(sancion.motivo)}</p>`,
      });
    } catch (err) {
      this.deps.logger.warn({ err, sancionId: sancion.id, usuarioId: sancion.usuarioId }, 'No se pudo enviar el correo de suspension; se ignora');
    }
  }

  async reactivar(adminId: number, usuarioId: number): Promise<void> {
    const { usuarioDAO, sancionDAO, conexion, reloj, logger } = this.deps;
    const usuario = await usuarioDAO.buscarPorId(usuarioId);
    if (!usuario) throw new UsuarioNoEncontradoException();
    if (usuario.status !== EstadoCuenta.SUSPENDIDO) throw new UsuarioNoSuspendidoException();
    const ahora = reloj.ahora();
    await conexion.transaccion(async (tx) => {
      const vigente = await sancionDAO.buscarVigente(usuarioId, ahora, tx);
      if (vigente) await sancionDAO.levantar(vigente.id, adminId, ahora, tx);
      await usuarioDAO.actualizarStatus(usuarioId, EstadoCuenta.ACTIVO, tx);
    });
    logger.info({ usuarioId, adminId }, 'Usuario reactivado');
  }

  async listarUsuarios(filtro: FiltroUsuarios, paginacion: Paginacion): Promise<Pagina<UsuarioModerado>> {
    const pagina = await this.deps.usuarioDAO.listar(filtro, paginacion);
    const items = await Promise.all(pagina.items.map((usuario) => this.conSancion(usuario)));
    return { ...pagina, items };
  }

  async obtenerUsuario(usuarioId: number): Promise<DetalleUsuarioModerado> {
    const { usuarioDAO, reporteDAO, denunciaDAO } = this.deps;
    const usuario = await usuarioDAO.buscarPorId(usuarioId);
    if (!usuario) throw new UsuarioNoEncontradoException();
    const [moderado, publicados, reportesDenunciados] = await Promise.all([
      this.conSancion(usuario),
      reporteDAO.listarPorUsuario(usuarioId, { page: 1, size: 1 }),
      denunciaDAO.contarRecibidasPorAutor(usuarioId),
    ]);
    return { ...moderado, reportesPublicados: publicados.total, reportesDenunciados };
  }

  /** The live sanction is only looked up for suspended accounts (the only ones that can have one). */
  private async conSancion(usuario: Usuario): Promise<UsuarioModerado> {
    const sancionVigente =
      usuario.status === EstadoCuenta.SUSPENDIDO ? await this.deps.sancionDAO.buscarVigente(usuario.id, this.deps.reloj.ahora()) : null;
    return { usuario, sancionVigente };
  }

  /**
   * Two reads whatever the page size: the page of reports with pending complaints and, in one batch, their report,
   * place and author. The page query already leaves ELIMINADO reports out (of the items and of `total`). A report that
   * is removed between the two reads is omitted from this page with a warning instead of failing the whole queue;
   * `total` stays the page query's count, so only that page comes out one row short, and the next request is exact.
   */
  async listarReportesDenunciados(paginacion: Paginacion): Promise<Pagina<ReporteDenunciadoItem>> {
    const pagina = await this.deps.denunciaDAO.listarReportesConPendientes(paginacion);
    if (pagina.items.length === 0) return { ...pagina, items: [] };
    const contextos = new Map(
      (await this.contextos.buscarPorReportes(pagina.items.map((i) => i.reporteId))).map((c) => [c.reporte.id, c]),
    );
    const items = pagina.items.flatMap((resumen) => {
      const contexto = contextos.get(resumen.reporteId);
      if (!contexto || contexto.reporte.estado === EstadoReporte.ELIMINADO) {
        this.deps.logger.warn({ reporteId: resumen.reporteId }, 'Reporte denunciado sin contexto vigente; se omite de la cola');
        return [];
      }
      return [{ ...resumen, ...contexto }];
    });
    return { ...pagina, items };
  }

  async obtenerReporteDenunciado(reporteId: number): Promise<DetalleReporteDenunciado> {
    const [contexto, motivos] = await Promise.all([this.contextoDe(reporteId), this.deps.denunciaDAO.resumirMotivos(reporteId)]);
    return { ...contexto, motivos, pendientes: motivos.reduce((suma, m) => suma + m.total, 0) };
  }

  /** The report with its place and author; ReporteNoEncontradoException when it does not exist or was removed. */
  private async contextoDe(reporteId: number, tx?: ContextoTx) {
    const { reporteDAO, lugarDAO, usuarioDAO } = this.deps;
    const reporte = await reporteDAO.buscarPorId(reporteId, tx);
    if (!reporte || reporte.estado === EstadoReporte.ELIMINADO) throw new ReporteNoEncontradoException();
    const [lugar, autor] = await Promise.all([lugarDAO.buscarPorId(reporte.lugarId, tx), usuarioDAO.buscarPorId(reporte.usuarioId, tx)]);
    if (!lugar || !autor) throw new ReporteNoEncontradoException();
    return { reporte, lugar, autor: aAutorReporte(autor) };
  }

  async resolverDenuncias(adminId: number, reporteId: number, decision: DecisionModeracion, comentario: string | null): Promise<ResultadoResolucion> {
    const { denunciaDAO, reporteDAO, lugarDAO, karmaService, saturacionService, conexion, reloj, logger } = this.deps;
    const { reporte } = await this.contextoDe(reporteId);
    const eliminar = decision === 'ELIMINAR';
    const ahora = reloj.ahora();

    const { resueltas, cambio } = await conexion.transaccion(async (tx) => {
      const bloqueado = eliminar ? await lugarDAO.buscarPorIdParaActualizar(reporte.lugarId, tx) : null;
      const total = await denunciaDAO.resolverPendientes(
        reporteId,
        eliminar ? EstadoDenuncia.PROCEDENTE : EstadoDenuncia.DESESTIMADA,
        adminId,
        ahora,
        tx,
      );
      if (total === 0) throw new SinDenunciasPendientesException();
      if (!eliminar) return { resueltas: total, cambio: null };
      await reporteDAO.actualizarEstado(reporteId, EstadoReporte.ELIMINADO, tx);
      await karmaService.revocarPorReporteEliminado(reporteId, tx);
      return { resueltas: total, cambio: await saturacionService.recalcular(reporte.lugarId, tx, bloqueado ?? undefined) };
    });

    logger.info({ reporteId, adminId, decision, denunciasResueltas: resueltas, comentario }, 'Denuncias resueltas');
    if (cambio && cambio.anterior !== cambio.nuevo) {
      await this.deps.subject.notificar(
        crearEventoSaturacion({
          ocurridoEn: cambio.actualizadoEn,
          lugarId: reporte.lugarId,
          nivelAnterior: cambio.anterior,
          nivelNuevo: cambio.nuevo,
          autorId: reporte.usuarioId,
        }),
      );
    }
    return { reporteId, estado: eliminar ? EstadoReporte.ELIMINADO : reporte.estado, denunciasResueltas: resueltas };
  }
}
