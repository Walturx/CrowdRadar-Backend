import { AppException } from '../AppException.js';
import { CodigoError } from '../CodigoError.js';

/** 503: a dependency (database) is unreachable. */
export class ServicioNoDisponibleException extends AppException {
  constructor(mensaje = 'Servicio no disponible. Inténtalo de nuevo más tarde.') {
    super(503, CodigoError.SERVICIO_NO_DISPONIBLE, mensaje);
  }
}
