import type { RequestHandler } from 'express';
import type { BuscarLugaresQueryDTO } from '../dto/request/lugar/BuscarLugaresQueryDTO.js';
import type { LugarIdParamsDTO } from '../dto/request/lugar/LugarIdParamsDTO.js';
import { respuesta } from '../dto/RespuestaDTO.js';
import { LugarMapper } from '../mapper/LugarMapper.js';
import type { LugarService } from '../service/LugarService.js';

/** HTTP adapter of LugarService; query and params were validated and parsed by `validar` into `res.locals`. */
export class LugarController {
  constructor(private readonly lugarService: LugarService) {}

  buscar: RequestHandler = async (_req, res) => {
    const consulta = res.locals.query as BuscarLugaresQueryDTO;
    const resultados = await this.lugarService.buscar(consulta);
    res.status(200).json(respuesta(LugarMapper.mensajeLista(resultados, consulta.q), { items: resultados.map(LugarMapper.aResumen) }));
  };

  obtenerDetalle: RequestHandler = async (req, res) => {
    const { id } = res.locals.params as LugarIdParamsDTO;
    const detalle = await this.lugarService.obtenerDetalle(id, req.usuario!.id);
    res.status(200).json(respuesta('Lugar obtenido correctamente.', LugarMapper.aDetalle(detalle)));
  };
}
