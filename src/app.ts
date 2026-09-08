import express, { type Express } from 'express';
import type { Contenedor } from './container/Contenedor.js';
import { crearManejadorErrores } from './middleware/manejarErrores.js';
import { rutaNoEncontrada } from './middleware/rutaNoEncontrada.js';

/** Builds the Express app from an assembled container; no module-level state, no database access. */
export function createApp(contenedor: Contenedor): Express {
  const app = express();

  app.use(express.json({ limit: '100kb' }));

  app.get('/', (_req, res) => {
    res.json({ message: 'CrowdRadar API' });
  });

  for (const { ruta, router } of contenedor.rutas) app.use(ruta, router);

  app.use(rutaNoEncontrada);
  app.use(crearManejadorErrores(contenedor.logger));
  return app;
}
