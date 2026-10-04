import { AppException } from '../AppException.js';
import { CodigoError } from '../CodigoError.js';

/** Default `Retry-After` for a dependency outage, in seconds. */
export const REINTENTO_503_SEG = 5;

/** 503: a dependency (database) is unreachable or too slow. */
export class ServicioNoDisponibleException extends AppException {
  constructor(mensaje = 'Servicio no disponible. Inténtalo de nuevo más tarde.', reintentarEnSeg = REINTENTO_503_SEG) {
    super(503, CodigoError.SERVICIO_NO_DISPONIBLE, mensaje, [], reintentarEnSeg);
  }
}
