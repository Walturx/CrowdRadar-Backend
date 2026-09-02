import { Router } from 'express';
import type { MiddlewaresRuta } from './middlewaresRuta.js';
import { noImplementado } from './stub.js';

/** Report validation and reporting abuse (M5), auth chain, mounted at /api AFTER the report router. */
export function crearValidacionRouter({ autenticar }: MiddlewaresRuta): Router {
  const router = Router();
  router.get('/validaciones/pendientes', autenticar, noImplementado('validacion.listarPendientes'));
  router.get('/reportes/:id', autenticar, noImplementado('validacion.obtenerReporte'));
  router.get('/reportes/:id/confiabilidad', autenticar, noImplementado('validacion.consultarConfiabilidad'));
  router.post('/reportes/:id/validaciones', autenticar, noImplementado('validacion.validar'));
  router.post('/reportes/:id/denuncias', autenticar, noImplementado('denuncia.denunciar'));
  return router;
}
