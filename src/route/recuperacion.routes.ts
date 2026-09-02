import { Router } from 'express';
import { noImplementado } from './stub.js';

/**
 * Password recovery (M1). Public chain; every handler is a 501 stub until M1 delivers it.
 * Mounted at "/" because the paths live under /api/auth and the HTML page under /recuperar.
 */
export function crearRecuperacionRouter(): Router {
  const router = Router();
  router.post('/api/auth/recuperar', noImplementado('recuperacion.solicitar'));
  router.get('/api/auth/restablecer/validar', noImplementado('recuperacion.validarToken'));
  router.post('/api/auth/restablecer', noImplementado('recuperacion.restablecer'));
  router.get('/recuperar/restablecer', noImplementado('recuperacion.mostrarPagina'));
  return router;
}
