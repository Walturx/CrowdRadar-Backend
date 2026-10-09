import { Router } from 'express';
import type { ReporteController } from '../controller/ReporteController.js';
import { crearReporteSchema } from '../dto/request/reporte/CrearReporteRequestDTO.js';
import { listarMisReportesSchema } from '../dto/request/reporte/ListarMisReportesQueryDTO.js';
import { validar } from '../middleware/validar.js';
import type { MiddlewareRuta } from './middlewareRuta.js';

/**
 * Saturation reports (M4), auth chain (autenticar -> validar -> controller), mounted at /api. FROZEN ORDER: this
 * router is mounted BEFORE the validation router, so /reportes/mios and /reportes/mios/validacion are never
 * captured by /reportes/:id.
 */
export function crearReporteRouter(controller: ReporteController, { autenticar }: MiddlewareRuta): Router {
  const router = Router();
  router.post('/reportes', autenticar, validar({ body: crearReporteSchema }), controller.registrar);
  router.get('/reportes/mios', autenticar, validar({ query: listarMisReportesSchema }), controller.listarMios);
  return router;
}
