import { Router } from 'express';
import type { MiddlewareRuta } from './middlewareRuta.js';
import { noImplementado } from './stub.js';

/** Favourites (M3), auth chain, mounted at /api. */
export function crearFavoritoRouter({ autenticar }: MiddlewareRuta): Router {
  const router = Router();
  router.get('/favoritos', autenticar, noImplementado('favorito.listar'));
  router.post('/favoritos', autenticar, noImplementado('favorito.agregar'));
  router.delete('/favoritos/:lugarId', autenticar, noImplementado('favorito.eliminar'));
  router.patch('/favoritos/:lugarId/alertas', autenticar, noImplementado('favorito.configurarAlertas'));
  return router;
}
