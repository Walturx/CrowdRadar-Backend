import { CodigoError } from '../CodigoError.js';
import { AccesoDenegadoException } from '../base/AccesoDenegadoException.js';

/** 403: the account is suspended; the app signs the user out on this code. */
export class CuentaSuspendidaException extends AccesoDenegadoException {
  constructor(mensaje = 'Tu cuenta está suspendida.') {
    super(CodigoError.CUENTA_SUSPENDIDA, mensaje);
  }
}
