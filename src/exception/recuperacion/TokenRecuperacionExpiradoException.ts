import { AppException } from '../AppException.js';
import { CodigoError } from '../CodigoError.js';

/** 410: the recovery token existed but its time to live ran out. */
export class TokenRecuperacionExpiradoException extends AppException {
  constructor() {
    super(410, CodigoError.TOKEN_RECUPERACION_EXPIRADO, 'El enlace ha caducado o no es válido.');
  }
}
