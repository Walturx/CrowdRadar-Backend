import { CodigoError } from '../CodigoError.js';
import { ReglaNegocioException } from '../base/ReglaNegocioException.js';

/** 422: the current password given when changing it does not match. */
export class PasswordActualIncorrectaException extends ReglaNegocioException {
  constructor() {
    super(CodigoError.PASSWORD_ACTUAL_INCORRECTA, 'La contraseña actual es incorrecta.');
  }
}
