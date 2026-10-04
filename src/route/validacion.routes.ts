import { Router, type RequestHandler } from 'express';
import type { DenunciaController } from '../controller/DenunciaController.js';
import type { ValidacionController } from '../controller/ValidacionController.js';
import { listarMisReportesSchema } from '../dto/request/reporte/ListarMisReportesQueryDTO.js';
import {
  crearListarPendientesQuerySchema,
  denunciarReporteSchema,
  reporteIdParamsSchema,
  validarReporteSchema,
} from '../dto/request/validacion/ValidacionRequestDTO.js';
import { validar } from '../middleware/validar.js';
import type { MiddlewareRuta } from './middlewareRuta.js';

/** Defaults of GET /api/validaciones/pendientes (RADIO_PENDIENTES_KM, VENTANA_PENDIENTES_HORAS). */
export interface DefectosPendientes {
  radioKm: number;
  horas: number;
}

/** Per-user rate limits of the two write endpoints (the only ones that move karma or file complaints). */
export interface LimitesAbuso {
  limitarValidaciones: RequestHandler;
  limitarDenuncias: RequestHandler;
}

/**
 * Report validation and reporting abuse (M5), auth chain (autenticar -> validar -> controller), mounted at /api AFTER the
 * report router, which owns /reportes and /reportes/mios. `/reportes/mios/validacion` still comes before `/reportes/:id`.
 */
export function crearValidacionRouter(
  { autenticar }: MiddlewareRuta,
  controller: ValidacionController,
  denuncias: DenunciaController,
  defectos: DefectosPendientes,
  limites: LimitesAbuso,
): Router {
  const router = Router();
  const pendientes = crearListarPendientesQuerySchema(defectos.radioKm, defectos.horas);
  router.get('/validaciones/pendientes', autenticar, validar({ query: pendientes }), controller.listarPendientes);
  router.get('/reportes/mios/validacion', autenticar, validar({ query: listarMisReportesSchema }), controller.consultarEstadoMisReportes);
  router.get('/reportes/:id', autenticar, validar({ params: reporteIdParamsSchema }), controller.obtenerReporte);
  router.get('/reportes/:id/confiabilidad', autenticar, validar({ params: reporteIdParamsSchema }), controller.consultarConfiabilidad);
  router.post('/reportes/:id/validaciones', autenticar, limites.limitarValidaciones, validar({ params: reporteIdParamsSchema, body: validarReporteSchema }), controller.validar);
  router.post('/reportes/:id/denuncias', autenticar, limites.limitarDenuncias, validar({ params: reporteIdParamsSchema, body: denunciarReporteSchema }), denuncias.denunciar);
  return router;
}
