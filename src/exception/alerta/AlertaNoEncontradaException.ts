import { CodigoError } from '../CodigoError.js';
import { RecursoNoEncontradoException } from '../http/RecursoNoEncontradoException.js';

/** 404: the alert does not exist or belongs to someone else (the two cases are indistinguishable on purpose). */
export class AlertaNoEncontradaException extends RecursoNoEncontradoException {
  constructor() {
    super(CodigoError.ALERTA_NO_ENCONTRADA, 'Alerta no encontrada.');
  }
}
