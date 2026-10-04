import { CodigoError } from '../CodigoError.js';
import { ReglaNegocioException } from '../http/ReglaNegocioException.js';

/** 422: an admin cannot sanction themselves or another admin. */
export class OperacionNoPermitidaException extends ReglaNegocioException {
  constructor(mensaje = 'No puedes sancionar a este usuario.') {
    super(CodigoError.OPERACION_NO_PERMITIDA, mensaje);
  }
}
