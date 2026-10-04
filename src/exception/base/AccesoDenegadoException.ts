import { AppException } from '../AppException.js';
import { CodigoError, type CodigoErrorValor } from '../CodigoError.js';

/** 403: authenticated but not allowed (role, suspended account). */
export class AccesoDenegadoException extends AppException {
  constructor(
    code: CodigoErrorValor = CodigoError.ACCESO_DENEGADO,
    mensaje = 'No tienes permisos para realizar esta acción.',
  ) {
    super(403, code, mensaje);
  }
}
