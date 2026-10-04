import { CodigoError } from '../CodigoError.js';
import { RecursoNoEncontradoException } from '../http/RecursoNoEncontradoException.js';

/** 404: the report does not exist or was removed (ELIMINADO). */
export class ReporteNoEncontradoException extends RecursoNoEncontradoException {
  constructor() {
    super(CodigoError.REPORTE_NO_ENCONTRADO, 'No se encontró el reporte.');
  }
}
