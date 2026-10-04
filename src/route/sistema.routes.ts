import { Router } from 'express';
import type { ConexionBD } from '../datasource/ConexionBD.js';
import { respuesta } from '../dto/RespuestaDTO.js';
import { ServicioNoDisponibleException } from '../exception/base/ServicioNoDisponibleException.js';

/** Public liveness routes, mounted at "/": the API banner and the database health check. */
export function crearSistemaRouter(conexion: ConexionBD): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ message: 'CrowdRadar API' });
  });

  router.get('/api/salud', async (_req, res) => {
    try {
      await conexion.verificar();
    } catch {
      throw new ServicioNoDisponibleException();
    }
    res.json(respuesta('Servicio disponible.', { estado: 'OK' }));
  });

  return router;
}
