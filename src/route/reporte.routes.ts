import { Router } from 'express';
import type { MiddlewaresRuta } from './middlewaresRuta.js';
import { noImplementado } from './stub.js';

/**
 * Saturation reports (M4), auth chain, mounted at /api. FROZEN ORDER: this router is mounted
 * BEFORE the validation router, so /reportes/mios and /reportes/mios/validacion are never
 * captured by /reportes/:id.
 */
export function crearReporteRouter({ autenticar }: MiddlewaresRuta): Router {
  const router = Router();
  router.post('/reportes', autenticar, noImplementado('reporte.registrar'));
  router.get('/reportes/mios', autenticar, noImplementado('reporte.listarMios'));
  router.get('/reportes/mios/validacion', autenticar, noImplementado('validacion.consultarEstadoMisReportes'));
  return router;
}
