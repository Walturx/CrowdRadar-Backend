import { Router } from 'express';
import type { MiddlewareRuta } from './middlewareRuta.js';
import { noImplementado } from './stub.js';

/** Moderation (M6), admin chain (autenticar -> requerirRol(ADMIN)), mounted at /api/admin. */
export function crearModeracionRouter({ autenticar, requerirAdmin }: MiddlewareRuta): Router {
  const router = Router();
  const admin = [autenticar, requerirAdmin];
  router.get('/reportes-denunciados', ...admin, noImplementado('moderacion.listarReportesDenunciados'));
  router.get('/reportes-denunciados/:reporteId', ...admin, noImplementado('moderacion.obtenerReporteDenunciado'));
  router.post('/reportes-denunciados/:reporteId/resolucion', ...admin, noImplementado('moderacion.resolverDenuncias'));
  router.get('/usuarios', ...admin, noImplementado('moderacion.listarUsuarios'));
  router.get('/usuarios/:id', ...admin, noImplementado('moderacion.obtenerUsuario'));
  router.post('/usuarios/:id/suspension', ...admin, noImplementado('moderacion.suspender'));
  router.post('/usuarios/:id/reactivacion', ...admin, noImplementado('moderacion.reactivar'));
  return router;
}
