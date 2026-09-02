import { Router } from 'express';
import type { MiddlewaresRuta } from './middlewaresRuta.js';
import { noImplementado } from './stub.js';

/**
 * Places (M2) and exploration (M3), auth chain, mounted at /api. FROZEN ORDER: the literal
 * paths /lugares/explorar and /lugares/categorias are declared before /lugares/:id.
 */
export function crearLugarRouter({ autenticar }: MiddlewaresRuta): Router {
  const router = Router();
  router.get('/lugares', autenticar, noImplementado('lugar.buscar'));
  router.get('/lugares/explorar', autenticar, noImplementado('exploracion.explorar'));
  router.get('/lugares/categorias', autenticar, noImplementado('exploracion.listarCategorias'));
  router.get('/lugares/:id', autenticar, noImplementado('lugar.obtenerDetalle'));
  return router;
}
