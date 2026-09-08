import { CodigoError } from '../CodigoError.js';
import { ReglaNegocioException } from '../base/ReglaNegocioException.js';

/** 422: the new password equals the current one. */
export class PasswordRepetidaException extends ReglaNegocioException {
  constructor() {
    super(CodigoError.PASSWORD_REPETIDA, 'La nueva contraseña debe ser distinta de la actual.');
  }
}
