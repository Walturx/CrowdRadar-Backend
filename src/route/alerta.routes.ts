import { Router } from 'express';
import type { AlertaController } from '../controller/AlertaController.js';
import { alertaIdParamsSchema, listarAlertasQuerySchema } from '../dto/request/alerta/AlertaRequestDTO.js';
import { validar } from '../middleware/validar.js';
import type { MiddlewareRuta } from './middlewareRuta.js';
import { noImplementado } from './stub.js';

export interface ControladoresAlerta {
  alertas: AlertaController;
}

/** Alerts and push devices (M3), auth chain: autenticar -> validar -> controller. Mounted at /api. */
export function crearAlertaRouter({ autenticar }: MiddlewareRuta, { alertas }: ControladoresAlerta): Router {
  const router = Router();
  router.get('/alertas', autenticar, validar({ query: listarAlertasQuerySchema }), alertas.listar);
  router.patch('/alertas/:id/leida', autenticar, validar({ params: alertaIdParamsSchema }), alertas.marcarLeida);
  router.post('/dispositivos', autenticar, noImplementado('alerta.registrarDispositivo'));
  router.delete('/dispositivos/:token', autenticar, noImplementado('alerta.eliminarDispositivo'));
  return router;
}
