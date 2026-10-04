import { Router, type RequestHandler } from 'express';
import type { UsuarioController } from '../controller/UsuarioController.js';
import { actualizarPerfilSchema } from '../dto/request/usuario/ActualizarPerfilRequestDTO.js';
import { cambiarPasswordSchema } from '../dto/request/usuario/CambiarPasswordRequestDTO.js';
import { validar } from '../middleware/validar.js';

export interface DependenciasUsuarioRouter {
  controller: UsuarioController;
  autenticar: RequestHandler;
  limitarPassword: RequestHandler;
}

/** Auth chain: autenticar -> validar -> controller. Mounted at /api/users. */
export function crearUsuarioRouter({ controller, autenticar, limitarPassword }: DependenciasUsuarioRouter): Router {
  const router = Router();
  router.get('/profile', autenticar, controller.obtenerPerfil);
  router.put('/profile', autenticar, validar({ body: actualizarPerfilSchema }), controller.actualizarPerfil);
  router.put('/password', autenticar, limitarPassword, validar({ body: cambiarPasswordSchema }), controller.cambiarPassword);
  return router;
}
