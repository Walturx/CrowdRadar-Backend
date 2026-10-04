import type { RequestHandler } from 'express';
import type { ExplorarLugaresQueryDTO } from '../dto/request/lugar/ExplorarLugaresQueryDTO.js';
import { respuesta } from '../dto/RespuestaDTO.js';
import { ExploracionMapper, MENSAJE_CATEGORIAS } from '../mapper/ExploracionMapper.js';
import type { ExploracionService } from '../service/ExploracionService.js';

/** HTTP adapter of ExploracionService; the query was validated and parsed by `validar` into `res.locals`. */
export class ExploracionController {
  constructor(private readonly exploracionService: ExploracionService) {}

  explorar: RequestHandler = async (_req, res) => {
    const { saturacion, ...consulta } = res.locals.query as ExplorarLugaresQueryDTO;
    const resultados = await this.exploracionService.explorar({ ...consulta, nivel: saturacion });
    res.status(200).json(
      respuesta(ExploracionMapper.mensaje(resultados, { categoria: consulta.categoria, saturacion }), ExploracionMapper.aResponse(resultados)),
    );
  };

  listarCategorias: RequestHandler = async (_req, res) => {
    const conteo = await this.exploracionService.listarCategorias();
    res.status(200).json(respuesta(MENSAJE_CATEGORIAS, ExploracionMapper.aCategorias(conteo)));
  };
}
