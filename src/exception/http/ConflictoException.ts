import { AppException } from '../AppException.js';
import { CodigoError, type CodigoErrorValor } from '../CodigoError.js';

/** 409: the request conflicts with the current state (duplicates). */
export class ConflictoException extends AppException {
  constructor(
    code: CodigoErrorValor = CodigoError.CONFLICTO,
    mensaje = 'El recurso ya existe o está en conflicto.',
  ) {
    super(409, code, mensaje);
  }
}
