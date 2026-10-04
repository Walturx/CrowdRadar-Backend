import { Router, type RequestHandler } from 'express';
import type { AuthController } from '../controller/AuthController.js';
import { iniciarSesionSchema } from '../dto/request/auth/IniciarSesionRequestDTO.js';
import { registrarUsuarioSchema } from '../dto/request/auth/RegistrarUsuarioRequestDTO.js';
import { validar } from '../middleware/validar.js';

export interface DependenciasAuthRouter {
  controller: AuthController;
  limitarRegistro: RequestHandler;
  limitarLogin: RequestHandler;
  /** Per-email failed-attempt lockout, runs after the IP limiter. */
  limitarBloqueoLogin: RequestHandler;
}

/** Public chain with rate limit: limiter -> validar -> controller. Mounted at /api/auth. */
export function crearAuthRouter({ controller, limitarRegistro, limitarLogin, limitarBloqueoLogin }: DependenciasAuthRouter): Router {
  const router = Router();
  router.post('/register', limitarRegistro, validar({ body: registrarUsuarioSchema }), controller.registrar);
  router.post('/login', limitarLogin, limitarBloqueoLogin, validar({ body: iniciarSesionSchema }), controller.iniciarSesion);
  return router;
}
