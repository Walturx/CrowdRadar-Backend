import type { RequestHandler } from 'express';
import { NoImplementadoException } from '../exception/base/NoImplementadoException.js';

/**
 * Handler of a frozen route whose stream has not delivered it yet: answers 501 NO_IMPLEMENTADO
 * (through the error middleware) naming the pending operation. The owning stream replaces it
 * with a real controller method without touching the path, method or middleware chain.
 */
export const noImplementado =
  (operacion: string): RequestHandler =>
  () => {
    throw new NoImplementadoException(`Funcionalidad no implementada: ${operacion}.`);
  };
