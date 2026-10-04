import { AppException, type DetalleError } from '../AppException.js';
import { CodigoError, type CodigoErrorValor } from '../CodigoError.js';

/** 400: input failed validation; `errors` lists one entry per failing field. */
export class ValidacionException extends AppException {
  constructor(
    errors: readonly DetalleError[] = [],
    mensaje = 'Datos inválidos.',
    code: CodigoErrorValor = CodigoError.VALIDACION_FALLIDA,
  ) {
    super(400, code, mensaje, errors);
  }
}
