import { CodigoError } from '../CodigoError.js';
import { ValidacionException } from '../http/ValidacionException.js';

/** 400: the recovery token is unknown or already used (the two cases are deliberately indistinguishable). */
export class TokenRecuperacionInvalidoException extends ValidacionException {
  constructor() {
    super([], 'El enlace ha caducado o no es válido.', CodigoError.TOKEN_RECUPERACION_INVALIDO);
  }
}
