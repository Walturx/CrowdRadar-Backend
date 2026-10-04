import { CodigoError } from '../CodigoError.js';
import { RecursoNoEncontradoException } from '../base/RecursoNoEncontradoException.js';

/** 404: the user id does not exist (e.g. the account was deleted after the token was issued). */
export class UsuarioNoEncontradoException extends RecursoNoEncontradoException {
  constructor() {
    super(CodigoError.USUARIO_NO_ENCONTRADO, 'Usuario no encontrado.');
  }
}
