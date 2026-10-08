import { CodigoError } from '../CodigoError.js';
import { ReglaNegocioException } from '../http/ReglaNegocioException.js';

/** 422: a user tried to vote on their own report. */
export class AutovalidacionException extends ReglaNegocioException {
  constructor() {
    super(CodigoError.AUTOVALIDACION_NO_PERMITIDA, 'No puedes validar tu propio reporte.');
  }
}
