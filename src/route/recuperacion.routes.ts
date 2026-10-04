import { Router, type RequestHandler } from 'express';
import type { RecuperacionController } from '../controller/RecuperacionController.js';
import {
  restablecerPasswordSchema,
  solicitarRecuperacionSchema,
  validarTokenQuerySchema,
} from '../dto/request/recuperacion/RecuperacionRequestDTO.js';
import { validar } from '../middleware/validar.js';

export interface DependenciasRecuperacionRouter {
  controller: RecuperacionController;
  limitarRecuperar: RequestHandler;
  /** Per-email counter, any IP: one mailbox cannot be flooded from many addresses. Runs after validation. */
  limitarRecuperarPorEmail: RequestHandler;
  limitarRestablecer: RequestHandler;
  /** The HTML page validates the token too (an oracle): its own counter, so viewing the page does not spend the reset budget. */
  limitarPagina: RequestHandler;
}

/**
 * Password recovery (M1). Public chain with rate limit: limiter -> validar -> controller. Mounted at "/" because the
 * paths live under /api/auth and the HTML page under /recuperar.
 */
export function crearRecuperacionRouter({ controller, limitarRecuperar, limitarRecuperarPorEmail, limitarRestablecer, limitarPagina }: DependenciasRecuperacionRouter): Router {
  const router = Router();
  router.post('/api/auth/recuperar', limitarRecuperar, validar({ body: solicitarRecuperacionSchema }), limitarRecuperarPorEmail, controller.solicitar);
  router.get('/api/auth/restablecer/validar', limitarRestablecer, validar({ query: validarTokenQuerySchema }), controller.validarToken);
  router.post('/api/auth/restablecer', limitarRestablecer, validar({ body: restablecerPasswordSchema }), controller.restablecer);
  router.get('/recuperar/restablecer', limitarPagina, controller.mostrarPagina);
  return router;
}
