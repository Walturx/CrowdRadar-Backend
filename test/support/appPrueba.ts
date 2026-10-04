import express, { type Express } from 'express';
import { crearManejadorErrores } from '../../src/middleware/manejarErrores.js';
import { rutaNoEncontrada } from '../../src/middleware/rutaNoEncontrada.js';
import type { Logger } from '../../src/util/logger.js';
import { crearLoggerSilencioso } from './LoggerSilencioso.js';

interface OpcionesAppPrueba {
  /** Mounts the routes under test. */
  montar: (app: Express) => void;
  logger?: Logger;
  limiteJson?: string;
}

/** Minimal Express app: JSON parser, routes under test, 404 and the single error middleware. */
export function crearAppPrueba({ montar, logger = crearLoggerSilencioso(), limiteJson = '100kb' }: OpcionesAppPrueba): Express {
  const app = express();
  app.use(express.json({ limit: limiteJson }));
  montar(app);
  app.use(rutaNoEncontrada);
  app.use(crearManejadorErrores(logger));
  return app;
}
