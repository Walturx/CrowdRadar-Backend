import { Router } from 'express';
import type { MiddlewareRuta } from './middlewareRuta.js';
import { noImplementado } from './stub.js';

/** Alerts and push devices (M3), auth chain, mounted at /api. */
export function crearAlertaRouter({ autenticar }: MiddlewareRuta): Router {
  const router = Router();
  router.get('/alertas', autenticar, noImplementado('alerta.listar'));
  router.patch('/alertas/:id/leida', autenticar, noImplementado('alerta.marcarLeida'));
  router.post('/dispositivos', autenticar, noImplementado('alerta.registrarDispositivo'));
  router.delete('/dispositivos/:token', autenticar, noImplementado('alerta.eliminarDispositivo'));
  return router;
}
