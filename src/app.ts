import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Contenedor } from './container/Contenedor.js';
import { crearManejadorErrores } from './middleware/manejarErrores.js';
import { crearRegistroPeticiones } from './middleware/registroPeticiones.js';
import { rutaNoEncontrada } from './middleware/rutaNoEncontrada.js';

/**
 * Builds the Express app from an assembled container; no module-level state and no
 * database access of its own. Mount order matters: security headers and CORS first,
 * request logging, body parsing, the routers in container order, 404 and, last, the
 * single error middleware.
 */
export function createApp(contenedor: Contenedor): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: [...contenedor.corsOrigenes] }));
  app.disable('x-powered-by');
  app.set('trust proxy', contenedor.trustProxy);
  // Request logging goes first so 400/413/415 body-parser rejections are logged too.
  app.use(crearRegistroPeticiones(contenedor.logger));
  app.use(express.json({ limit: '100kb' }));

  for (const { ruta, router } of contenedor.rutas) app.use(ruta, router);

  app.use(rutaNoEncontrada);
  app.use(crearManejadorErrores(contenedor.logger));
  return app;
}
