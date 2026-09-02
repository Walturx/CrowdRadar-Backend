import { CodigoError } from '../CodigoError.js';
import { NoAutenticadoException } from '../http/NoAutenticadoException.js';

/** 401: unknown email or wrong password; both cases share this exact message (anti-enumeration). */
export class CredencialesInvalidasException extends NoAutenticadoException {
  constructor() {
    super(CodigoError.CREDENCIALES_INVALIDAS, 'Correo o contraseña incorrectos.');
  }
}
