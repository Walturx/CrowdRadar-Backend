import { CodigoError } from '../CodigoError.js';
import { ConflictoException } from '../http/ConflictoException.js';

/** 409: the email already belongs to an account (code EMAIL_DUPLICADO). */
export class EmailYaRegistradoException extends ConflictoException {
  constructor(mensaje = 'El correo ya está registrado.') {
    super(CodigoError.EMAIL_DUPLICADO, mensaje);
  }
}
