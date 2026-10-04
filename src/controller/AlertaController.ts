import type { RequestHandler } from 'express';
import type { AlertaIdParamsDTO, ListarAlertasQueryDTO } from '../dto/request/alerta/AlertaRequestDTO.js';
import { respuesta } from '../dto/RespuestaDTO.js';
import { AlertaMapper } from '../mapper/AlertaMapper.js';
import type { AlertaService } from '../service/AlertaService.js';

/** HTTP adapter of AlertaService; `req.usuario` is set by `autenticar`, query and params by `validar`. */
export class AlertaController {
  constructor(private readonly alertaService: AlertaService) {}

  listar: RequestHandler = async (req, res) => {
    const { page, size } = res.locals.query as ListarAlertasQueryDTO;
    const listado = await this.alertaService.listar(req.usuario!.id, { page, size });
    const mensaje = listado.pagina.total === 0 ? 'No tienes alertas.' : 'Alertas obtenidas correctamente.';
    res.status(200).json(respuesta(mensaje, AlertaMapper.aListado(listado)));
  };

  marcarLeida: RequestHandler = async (req, res) => {
    const { id } = res.locals.params as AlertaIdParamsDTO;
    const alerta = await this.alertaService.marcarLeida(req.usuario!.id, id);
    res.status(200).json(respuesta('Alerta marcada como leída.', AlertaMapper.aResponse(alerta)));
  };
}
