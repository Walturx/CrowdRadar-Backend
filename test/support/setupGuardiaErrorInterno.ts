/**
 * Vitest setup file (see vitest.config.ts): every in-process app built by a test gets the real error middleware
 * wrapped so that a request ending in the generic 500 ERROR_INTERNO fails the test that sent it. Tests that expect a
 * 500 on purpose call `permitirErrorInterno()`. Out-of-process servers (spawned `src/server.ts`) are not covered.
 */
import type { ErrorRequestHandler } from 'express';
import { afterEach, vi } from 'vitest';
import type * as ManejarErrores from '../../src/middleware/manejarErrores.js';
import { describirError, extraerErroresNoPermitidos, registrarErrorInterno } from './guardiaErrorInterno.js';

vi.mock('../../src/middleware/manejarErrores.js', async (importOriginal) => {
  const real = await importOriginal<typeof ManejarErrores>();
  const crearManejadorErrores: typeof real.crearManejadorErrores = (logger) => {
    const manejador = real.crearManejadorErrores(logger);
    const vigilado: ErrorRequestHandler = (error, req, res, next) => {
      if (!res.headersSent && real.traducirError(error).esInterno) registrarErrorInterno(`${req.method} ${req.originalUrl}`, error);
      manejador(error, req, res, next);
    };
    return vigilado;
  };
  return { ...real, crearManejadorErrores };
});

afterEach(() => {
  const noPermitidos = extraerErroresNoPermitidos();
  if (noPermitidos.length > 0) {
    const detalle = noPermitidos.map(({ peticion, error }) => `${peticion} -> ${describirError(error)}`).join('\n\n');
    throw new Error(
      `La prueba recibió ${noPermitidos.length} respuesta(s) 500 ERROR_INTERNO no esperadas (error no manejado). ` +
        `Si es intencional, llama a permitirErrorInterno().\n${detalle}`,
    );
  }
});
