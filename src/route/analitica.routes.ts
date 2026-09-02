import { Router } from 'express';
import type { MiddlewaresRuta } from './middlewaresRuta.js';
import { noImplementado } from './stub.js';

/** Place analytics (M4), auth chain, mounted at /api. */
export function crearAnaliticaRouter({ autenticar }: MiddlewaresRuta): Router {
  const router = Router();
  router.get('/lugares/:id/historial', autenticar, noImplementado('analitica.obtenerHistorial'));
  router.get('/lugares/:id/comparar', autenticar, noImplementado('analitica.compararPeriodos'));
  router.get('/lugares/:id/mejor-horario', autenticar, noImplementado('analitica.obtenerMejorHorario'));
  return router;
}
