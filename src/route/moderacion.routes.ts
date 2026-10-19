import { Router } from 'express';
import type { ModeracionController } from '../controller/ModeracionController.js';
import {
  listarUsuariosSchema,
  reporteDenunciadoParamsSchema,
  resolverDenunciasSchema,
  suspenderUsuarioSchema,
  usuarioIdParamsSchema,
} from '../dto/request/moderacion/ModeracionRequestDTO.js';
import { listarMisReportesSchema } from '../dto/request/reporte/ListarMisReportesQueryDTO.js';
import { validar } from '../middleware/validar.js';
import type { MiddlewareRuta } from './middlewareRuta.js';

/** Moderation (M6), admin chain (autenticar -> requerirRol(ADMIN) -> validar -> controller), mounted at /api/admin. */
export function crearModeracionRouter({ autenticar, requerirAdmin }: MiddlewareRuta, controller: ModeracionController): Router {
  const router = Router();
  const admin = [autenticar, requerirAdmin];
  const reporte = { params: reporteDenunciadoParamsSchema };
  const usuario = { params: usuarioIdParamsSchema };
  router.get('/reportes-denunciados', ...admin, validar({ query: listarMisReportesSchema }), controller.listarReportesDenunciados);
  router.get('/reportes-denunciados/:reporteId', ...admin, validar(reporte), controller.obtenerReporteDenunciado);
  router.post('/reportes-denunciados/:reporteId/resolucion', ...admin, validar({ ...reporte, body: resolverDenunciasSchema }), controller.resolverDenuncias);
  router.get('/usuarios', ...admin, validar({ query: listarUsuariosSchema }), controller.listarUsuarios);
  router.get('/usuarios/:id', ...admin, validar(usuario), controller.obtenerUsuario);
  router.post('/usuarios/:id/suspension', ...admin, validar({ ...usuario, body: suspenderUsuarioSchema }), controller.suspender);
  router.post('/usuarios/:id/reactivacion', ...admin, validar(usuario), controller.reactivar);
  return router;
}
