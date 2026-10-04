import { Router } from 'express';
import type { FavoritoController } from '../controller/FavoritoController.js';
import {
  agregarFavoritoSchema,
  configurarAlertasSchema,
  favoritoLugarParamsSchema,
} from '../dto/request/favorito/FavoritoRequestDTO.js';
import { validar } from '../middleware/validar.js';
import type { MiddlewareRuta } from './middlewareRuta.js';

/** Favourites (M3), auth chain: autenticar -> validar -> controller. Mounted at /api. */
export function crearFavoritoRouter({ autenticar }: MiddlewareRuta, controller: FavoritoController): Router {
  const router = Router();
  router.get('/favoritos', autenticar, controller.listar);
  router.post('/favoritos', autenticar, validar({ body: agregarFavoritoSchema }), controller.agregar);
  router.delete('/favoritos/:lugarId', autenticar, validar({ params: favoritoLugarParamsSchema }), controller.eliminar);
  router.patch(
    '/favoritos/:lugarId/alertas',
    autenticar,
    validar({ params: favoritoLugarParamsSchema, body: configurarAlertasSchema }),
    controller.configurarAlertas,
  );
  return router;
}
