import type { RequestHandler } from 'express';
import type { DenunciarReporteRequestDTO, ReporteIdParamsDTO } from '../dto/request/validacion/ValidacionRequestDTO.js';
import { respuesta } from '../dto/RespuestaDTO.js';
import { DenunciaMapper, MENSAJE_DENUNCIA_ENVIADA } from '../mapper/DenunciaMapper.js';
import type { DenunciaService } from '../service/DenunciaService.js';

/** HTTP adapter of DenunciaService; `req.usuario` is set by `autenticar`, params and body by `validar`. */
export class DenunciaController {
  constructor(private readonly denunciaService: DenunciaService) {}

  denunciar: RequestHandler = async (req, res) => {
    const { id } = res.locals.params as ReporteIdParamsDTO;
    const { motivo, detalle } = req.body as DenunciarReporteRequestDTO;
    const denuncia = await this.denunciaService.denunciar(req.usuario!.id, id, motivo, detalle ?? null);
    res.status(201).json(respuesta(MENSAJE_DENUNCIA_ENVIADA, DenunciaMapper.aCreada(denuncia)));
  };
}
