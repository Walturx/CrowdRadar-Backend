import { CodigoError } from '../CodigoError.js';
import { ConflictoException } from '../http/ConflictoException.js';

/** 409: the user is not suspended, so there is nothing to lift. */
export class UsuarioNoSuspendidoException extends ConflictoException {
  constructor() {
    super(CodigoError.USUARIO_NO_SUSPENDIDO, 'El usuario no está suspendido.');
  }
}
