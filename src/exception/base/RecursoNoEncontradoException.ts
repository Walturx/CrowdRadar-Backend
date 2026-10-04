import { AppException } from '../AppException.js';
import type { CodigoErrorValor } from '../CodigoError.js';

/** 404: the requested resource does not exist. */
export class RecursoNoEncontradoException extends AppException {
  constructor(code: CodigoErrorValor, mensaje: string) {
    super(404, code, mensaje);
  }
}
