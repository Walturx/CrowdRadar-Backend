import { AppException } from '../AppException.js';
import { CodigoError, type CodigoErrorValor } from '../CodigoError.js';

/** 422: well-formed request that breaks a business rule. */
export class ReglaNegocioException extends AppException {
  constructor(
    code: CodigoErrorValor = CodigoError.OPERACION_NO_PERMITIDA,
    mensaje = 'La operación no está permitida.',
  ) {
    super(422, code, mensaje);
  }
}
