import { CodigoError } from '../CodigoError.js';
import { ConflictoException } from '../http/ConflictoException.js';

/** 409: the user already has a live suspension. */
export class UsuarioYaSuspendidoException extends ConflictoException {
  constructor() {
    super(CodigoError.USUARIO_YA_SUSPENDIDO, 'El usuario ya está suspendido.');
  }
}
