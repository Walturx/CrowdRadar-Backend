import type { RequestHandler } from 'express';
import type { Paginacion } from '../dao/Paginacion.js';
import type {
  ListarUsuariosQueryDTO,
  ReporteDenunciadoParamsDTO,
  ResolverDenunciasRequestDTO,
  SuspenderUsuarioRequestDTO,
  UsuarioIdParamsDTO,
} from '../dto/request/moderacion/ModeracionRequestDTO.js';
import { respuesta, respuestaSinDatos } from '../dto/RespuestaDTO.js';
import type { ModeracionFacade } from '../facade/ModeracionFacade.js';
import {
  MENSAJE_DETALLE_DENUNCIADO,
  MENSAJE_DETALLE_USUARIO,
  MENSAJE_REACTIVACION,
  MENSAJE_REPORTES_DENUNCIADOS,
  MENSAJE_RESOLUCION,
  MENSAJE_SIN_DENUNCIAS,
  MENSAJE_SIN_USUARIOS,
  MENSAJE_SUSPENSION,
  MENSAJE_USUARIOS,
  ModeracionMapper,
} from '../mapper/ModeracionMapper.js';

/** HTTP adapter of ModeracionFacade; `req.usuario` is the admin set by `autenticar`, query, params and body come from `validar`. */
export class ModeracionController {
  constructor(private readonly facade: ModeracionFacade) {}

  listarReportesDenunciados: RequestHandler = async (_req, res) => {
    const pagina = await this.facade.listarReportesDenunciados(res.locals.query as Paginacion);
    const mensaje = pagina.total === 0 ? MENSAJE_SIN_DENUNCIAS : MENSAJE_REPORTES_DENUNCIADOS;
    res.status(200).json(respuesta(mensaje, ModeracionMapper.aPaginaReportesDenunciados(pagina)));
  };

  obtenerReporteDenunciado: RequestHandler = async (_req, res) => {
    const { reporteId } = res.locals.params as ReporteDenunciadoParamsDTO;
    const detalle = await this.facade.obtenerReporteDenunciado(reporteId);
    res.status(200).json(respuesta(MENSAJE_DETALLE_DENUNCIADO, ModeracionMapper.aDetalleReporte(detalle)));
  };

  resolverDenuncias: RequestHandler = async (req, res) => {
    const { reporteId } = res.locals.params as ReporteDenunciadoParamsDTO;
    const { decision, comentario } = req.body as ResolverDenunciasRequestDTO;
    const resultado = await this.facade.resolverDenuncias(req.usuario!.id, reporteId, decision, comentario ?? null);
    res.status(200).json(respuesta(MENSAJE_RESOLUCION, ModeracionMapper.aResolucion(resultado)));
  };

  listarUsuarios: RequestHandler = async (_req, res) => {
    const { q, status, orden, page, size } = res.locals.query as ListarUsuariosQueryDTO;
    const pagina = await this.facade.listarUsuarios({ q, status, orden }, { page, size });
    const mensaje = pagina.total === 0 ? MENSAJE_SIN_USUARIOS : MENSAJE_USUARIOS;
    res.status(200).json(respuesta(mensaje, ModeracionMapper.aPaginaUsuarios(pagina)));
  };

  obtenerUsuario: RequestHandler = async (_req, res) => {
    const { id } = res.locals.params as UsuarioIdParamsDTO;
    const detalle = await this.facade.obtenerUsuario(id);
    res.status(200).json(respuesta(MENSAJE_DETALLE_USUARIO, ModeracionMapper.aDetalleUsuario(detalle)));
  };

  suspender: RequestHandler = async (req, res) => {
    const { id } = res.locals.params as UsuarioIdParamsDTO;
    const { dias, motivo } = req.body as SuspenderUsuarioRequestDTO;
    const sancion = await this.facade.suspender(req.usuario!.id, id, dias, motivo);
    res.status(201).json(respuesta(MENSAJE_SUSPENSION, ModeracionMapper.aSancion(sancion)));
  };

  reactivar: RequestHandler = async (req, res) => {
    const { id } = res.locals.params as UsuarioIdParamsDTO;
    await this.facade.reactivar(req.usuario!.id, id);
    res.status(200).json(respuestaSinDatos(MENSAJE_REACTIVACION));
  };
}
