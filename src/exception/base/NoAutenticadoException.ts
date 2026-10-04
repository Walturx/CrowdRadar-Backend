import { AppException } from '../AppException.js';
import type { CodigoErrorValor } from '../CodigoError.js';

/** 401: the caller is not (validly) authenticated. */
export class NoAutenticadoException extends AppException {
  constructor(code: CodigoErrorValor, mensaje: string) {
    super(401, code, mensaje);
  }
}
