import type { RequestHandler } from 'express';
import type { ListarMisReportesQueryDTO } from '../dto/request/reporte/ListarMisReportesQueryDTO.js';
import type {
  ListarPendientesQueryDTO,
  ReporteIdParamsDTO,
  ValidarReporteRequestDTO,
} from '../dto/request/validacion/ValidacionRequestDTO.js';
import { respuesta } from '../dto/RespuestaDTO.js';
import {
  MENSAJE_CONFIABILIDAD,
  MENSAJE_DETALLE_REPORTE,
  MENSAJE_PENDIENTES,
  MENSAJE_SIN_PENDIENTES,
  ValidacionMapper,
} from '../mapper/ValidacionMapper.js';
import type { ValidacionService } from '../service/ValidacionService.js';

/** HTTP adapter of ValidacionService; `req.usuario` is set by `autenticar`, query, params and body by `validar`. */
export class ValidacionController {
  constructor(private readonly validacionService: ValidacionService) {}

  listarPendientes: RequestHandler = async (req, res) => {
    const consulta = res.locals.query as ListarPendientesQueryDTO;
    const pagina = await this.validacionService.listarPendientes(req.usuario!.id, consulta);
    const mensaje = pagina.total === 0 ? MENSAJE_SIN_PENDIENTES : MENSAJE_PENDIENTES;
    res.status(200).json(respuesta(mensaje, ValidacionMapper.aPaginaPendientes(pagina)));
  };

  obtenerReporte: RequestHandler = async (req, res) => {
    const { id } = res.locals.params as ReporteIdParamsDTO;
    const detalle = await this.validacionService.obtenerReporte(req.usuario!.id, id);
    res.status(200).json(respuesta(MENSAJE_DETALLE_REPORTE, ValidacionMapper.aDetalle(detalle)));
  };

  consultarConfiabilidad: RequestHandler = async (_req, res) => {
    const { id } = res.locals.params as ReporteIdParamsDTO;
    const confiabilidad = await this.validacionService.consultarConfiabilidad(id);
    res.status(200).json(respuesta(MENSAJE_CONFIABILIDAD, ValidacionMapper.aConfiabilidad(confiabilidad)));
  };

  validar: RequestHandler = async (req, res) => {
    const { id } = res.locals.params as ReporteIdParamsDTO;
    const { tipoAccion } = req.body as ValidarReporteRequestDTO;
    const resultado = await this.validacionService.validar(req.usuario!.id, id, tipoAccion);
    const mensaje = `¡Gracias por validar! +${resultado.karma.puntosGanados} karma`;
    res.status(201).json(respuesta(mensaje, ValidacionMapper.aCreada(resultado)));
  };

  consultarEstadoMisReportes: RequestHandler = async (req, res) => {
    const { page, size } = res.locals.query as ListarMisReportesQueryDTO;
    const pagina = await this.validacionService.consultarEstadoMisReportes(req.usuario!.id, { page, size });
    res.status(200).json(respuesta(ValidacionMapper.mensajeEstado(pagina), ValidacionMapper.aPaginaEstado(pagina)));
  };
}
