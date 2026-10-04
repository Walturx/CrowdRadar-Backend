import { Router } from 'express';
import type { LugarController } from '../controller/LugarController.js';
import { buscarLugaresQuerySchema } from '../dto/request/lugar/BuscarLugaresQueryDTO.js';
import { lugarIdParamsSchema } from '../dto/request/lugar/LugarIdParamsDTO.js';
import { validar } from '../middleware/validar.js';
import type { MiddlewareRuta } from './middlewareRuta.js';
import { noImplementado } from './stub.js';

/**
 * Places (M2) and exploration (M3), auth chain, mounted at /api. FROZEN ORDER: the literal
 * paths /lugares/explorar and /lugares/categorias are declared before /lugares/:id.
 */
export function crearLugarRouter({ autenticar }: MiddlewareRuta, controller: LugarController): Router {
  const router = Router();
  router.get('/lugares', autenticar, validar({ query: buscarLugaresQuerySchema }), controller.buscar);
  router.get('/lugares/explorar', autenticar, noImplementado('exploracion.explorar'));
  router.get('/lugares/categorias', autenticar, noImplementado('exploracion.listarCategorias'));
  router.get('/lugares/:id', autenticar, validar({ params: lugarIdParamsSchema }), controller.obtenerDetalle);
  return router;
}
