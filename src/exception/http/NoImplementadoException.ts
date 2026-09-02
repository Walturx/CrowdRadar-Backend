import { AppException } from '../AppException.js';
import { CodigoError } from '../CodigoError.js';

/** 501: frozen route whose handler a later stream has not implemented yet. */
export class NoImplementadoException extends AppException {
  constructor(mensaje = 'Funcionalidad no implementada.') {
    super(501, CodigoError.NO_IMPLEMENTADO, mensaje);
  }
}
