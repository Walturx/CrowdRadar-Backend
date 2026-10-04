import { Router } from 'express';
import type { ExploracionController } from '../controller/ExploracionController.js';
import type { LugarController } from '../controller/LugarController.js';
import { crearBuscarLugaresQuerySchema, type LimitesBusquedaLugares } from '../dto/request/lugar/BuscarLugaresQueryDTO.js';
import { crearExplorarLugaresQuerySchema } from '../dto/request/lugar/ExplorarLugaresQueryDTO.js';
import { lugarIdParamsSchema } from '../dto/request/lugar/LugarIdParamsDTO.js';
import { validar } from '../middleware/validar.js';
import type { MiddlewareRuta } from './middlewareRuta.js';

/**
 * Places (M2) and exploration (M3), auth chain, mounted at /api. FROZEN ORDER: the literal
 * paths /lugares/explorar and /lugares/categorias are declared before /lugares/:id.
 */
export function crearLugarRouter(
  { autenticar }: MiddlewareRuta,
  controller: LugarController,
  limites: LimitesBusquedaLugares,
  exploracion: { controller: ExploracionController; radioPorDefectoKm: number },
): Router {
  const router = Router();
  router.get('/lugares', autenticar, validar({ query: crearBuscarLugaresQuerySchema(limites) }), controller.buscar);
  router.get('/lugares/explorar', autenticar, validar({ query: crearExplorarLugaresQuerySchema(limites, exploracion.radioPorDefectoKm) }), exploracion.controller.explorar);
  router.get('/lugares/categorias', autenticar, exploracion.controller.listarCategorias);
  router.get('/lugares/:id', autenticar, validar({ params: lugarIdParamsSchema }), controller.obtenerDetalle);
  return router;
}
