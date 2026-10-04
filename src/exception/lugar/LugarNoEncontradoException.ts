import { CodigoError } from '../CodigoError.js';
import { RecursoNoEncontradoException } from '../http/RecursoNoEncontradoException.js';

/** 404: the place id does not exist. */
export class LugarNoEncontradoException extends RecursoNoEncontradoException {
  constructor() {
    super(CodigoError.LUGAR_NO_ENCONTRADO, 'No se pudo obtener la información del lugar.');
  }
}
