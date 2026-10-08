import { CodigoError } from '../CodigoError.js';
import { ReglaNegocioException } from '../http/ReglaNegocioException.js';

/** 422: a user tried to report their own report. */
export class AutodenunciaException extends ReglaNegocioException {
  constructor() {
    super(CodigoError.AUTODENUNCIA_NO_PERMITIDA, 'No puedes denunciar tu propio reporte.');
  }
}
