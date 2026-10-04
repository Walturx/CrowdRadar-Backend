import type { RequestHandler } from 'express';
import type { CrearReporteRequestDTO } from '../dto/request/reporte/CrearReporteRequestDTO.js';
import type { ListarMisReportesQueryDTO } from '../dto/request/reporte/ListarMisReportesQueryDTO.js';
import { respuesta } from '../dto/RespuestaDTO.js';
import type { ReporteFacade } from '../facade/ReporteFacade.js';
import { ReporteMapper } from '../mapper/ReporteMapper.js';
import type { ReporteService } from '../service/ReporteService.js';

export const MENSAJE_REPORTE_CREADO = 'Reporte registrado correctamente.';
export const MENSAJE_SIN_REPORTES = 'Aún no tienes reportes';
const MENSAJE_MIS_REPORTES = 'Reportes obtenidos correctamente.';

/** HTTP adapter of the report stream; `req.usuario` is set by `autenticar` on every route using it. */
export class ReporteController {
  constructor(
    private readonly reporteFacade: ReporteFacade,
    private readonly reporteService: ReporteService,
  ) {}

  registrar: RequestHandler = async (req, res) => {
    const { lugarId, nivel } = req.body as CrearReporteRequestDTO;
    const registrado = await this.reporteFacade.registrar(req.usuario!.id, lugarId, nivel);
    res.status(201).json(respuesta(MENSAJE_REPORTE_CREADO, ReporteMapper.aCreado(registrado)));
  };

  listarMios: RequestHandler = async (req, res) => {
    const { page, size } = res.locals.query as ListarMisReportesQueryDTO;
    const pagina = await this.reporteService.listarMios(req.usuario!.id, { page, size });
    const mensaje = pagina.total === 0 ? MENSAJE_SIN_REPORTES : MENSAJE_MIS_REPORTES;
    res.status(200).json(respuesta(mensaje, ReporteMapper.aPagina(pagina)));
  };
}
