import { CodigoError } from '../CodigoError.js';
import { RecursoNoEncontradoException } from '../http/RecursoNoEncontradoException.js';

/** 404: no account has that email. Only raised when POLITICA_MENSAJES_AUTH=DETALLADA. */
export class CuentaNoExisteException extends RecursoNoEncontradoException {
  constructor() {
    super(CodigoError.CUENTA_NO_EXISTE, 'No existe una cuenta con ese correo.');
  }
}
