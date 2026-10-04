import { AppException } from '../AppException.js';
import { CodigoError } from '../CodigoError.js';
import { REINTENTO_503_SEG } from './ServicioNoDisponibleException.js';

/** 503: the process received a shutdown signal and no longer takes traffic (readiness probe). */
export class ApagandoException extends AppException {
  constructor(mensaje = 'El servicio se está apagando.') {
    super(503, CodigoError.APAGANDO, mensaje, [], REINTENTO_503_SEG);
  }
}
