import type { RequestHandler } from 'express';
import { CodigoError } from '../exception/CodigoError.js';
import { RecursoNoEncontradoException } from '../exception/http/RecursoNoEncontradoException.js';

/** Last route before the error middleware: unmatched paths become a 404 envelope, not Express HTML. */
export const rutaNoEncontrada: RequestHandler = (_req, _res, next) => {
  next(new RecursoNoEncontradoException(CodigoError.RUTA_NO_ENCONTRADA, 'Ruta no encontrada.'));
};
