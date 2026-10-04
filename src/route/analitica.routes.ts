import { Router } from 'express';
import type { AnaliticaController } from '../controller/AnaliticaController.js';
import {
  compararSchema,
  historialSchema,
  lugarIdSchema,
  mejorHorarioSchema,
} from '../dto/request/analitica/AnaliticaRequestDTO.js';
import { validar } from '../middleware/validar.js';
import type { MiddlewareRuta } from './middlewareRuta.js';

/** Place analytics (M4), auth chain (autenticar -> validar -> controller), mounted at /api. */
export function crearAnaliticaRouter(controller: AnaliticaController, { autenticar }: MiddlewareRuta): Router {
  const router = Router();
  const params = lugarIdSchema;
  router.get('/lugares/:id/historial', autenticar, validar({ params, query: historialSchema }), controller.obtenerHistorial);
  router.get('/lugares/:id/comparar', autenticar, validar({ params, query: compararSchema }), controller.compararPeriodos);
  router.get(
    '/lugares/:id/mejor-horario',
    autenticar,
    validar({ params, query: mejorHorarioSchema }),
    controller.obtenerMejorHorario,
  );
  return router;
}
