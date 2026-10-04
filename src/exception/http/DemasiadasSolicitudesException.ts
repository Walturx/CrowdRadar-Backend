import { AppException } from '../AppException.js';
import { CodigoError } from '../CodigoError.js';

/** 429: rate limit exceeded. */
export class DemasiadasSolicitudesException extends AppException {
  constructor(mensaje = 'Demasiadas solicitudes. Inténtalo más tarde.', reintentarEnSeg?: number) {
    super(429, CodigoError.DEMASIADAS_SOLICITUDES, mensaje, [], reintentarEnSeg);
  }
}
