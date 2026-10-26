import { Router } from 'express';
import type { AlertaController } from '../controller/AlertaController.js';
import type { DispositivoController } from '../controller/DispositivoController.js';
import { alertaIdParamsSchema, listarAlertasQuerySchema } from '../dto/request/alerta/AlertaRequestDTO.js';
import { dispositivoTokenParamsSchema, registrarDispositivoSchema } from '../dto/request/alerta/DispositivoRequestDTO.js';
import { validar } from '../middleware/validar.js';
import type { MiddlewareRuta } from './middlewareRuta.js';

export interface ControladoresAlerta {
  alertas: AlertaController;
  dispositivos: DispositivoController;
}

/** Alerts and push devices (M3), auth chain: autenticar -> validar -> controller. Mounted at /api. */
export function crearAlertaRouter({ autenticar }: MiddlewareRuta, { alertas, dispositivos }: ControladoresAlerta): Router {
  const router = Router();
  router.get('/alertas', autenticar, validar({ query: listarAlertasQuerySchema }), alertas.listar);
  router.patch('/alertas/:id/leida', autenticar, validar({ params: alertaIdParamsSchema }), alertas.marcarLeida);
  router.post('/dispositivos', autenticar, validar({ body: registrarDispositivoSchema }), dispositivos.registrar);
  router.delete('/dispositivos/:token', autenticar, validar({ params: dispositivoTokenParamsSchema }), dispositivos.eliminar);
  return router;
}
