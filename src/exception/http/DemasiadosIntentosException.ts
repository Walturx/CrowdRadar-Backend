import { AppException } from '../AppException.js';
import { CodigoError } from '../CodigoError.js';

/** 429: too many failed attempts for one account; the lockout lasts until `reintentarEnSeg` elapses. */
export class DemasiadosIntentosException extends AppException {
  constructor(reintentarEnSeg?: number, mensaje = 'Demasiados intentos fallidos. Inténtalo más tarde.') {
    super(429, CodigoError.DEMASIADOS_INTENTOS, mensaje, [], reintentarEnSeg);
  }
}
