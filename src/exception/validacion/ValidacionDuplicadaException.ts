import { CodigoError } from '../CodigoError.js';
import { ConflictoException } from '../http/ConflictoException.js';

/** 409: the user already voted on the report (HU 5.1 c3). */
export class ValidacionDuplicadaException extends ConflictoException {
  constructor() {
    super(CodigoError.VALIDACION_DUPLICADA, 'Ya participaste en la validación de este reporte.');
  }
}
