import type { CodigoErrorValor } from './CodigoError.js';

/** One entry of the envelope's `errors[]`: a field and what is wrong with it. */
export interface DetalleError {
  campo: string;
  mensaje: string;
}

/**
 * Root of the domain exception hierarchy. Subclasses fix the HTTP status by class
 * (400/401/403/404/409/422/429/501/503); only `manejarErrores` turns them into a
 * response (dependency rule 6). `message` is the Spanish text the app shows.
 */
export class AppException extends Error {
  constructor(
    readonly status: number,
    readonly code: CodigoErrorValor,
    mensaje: string,
    readonly errors: readonly DetalleError[] = [],
  ) {
    super(mensaje);
    this.name = new.target.name;
  }
}
