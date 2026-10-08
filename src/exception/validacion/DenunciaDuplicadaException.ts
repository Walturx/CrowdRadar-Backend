import { CodigoError } from '../CodigoError.js';
import { ConflictoException } from '../http/ConflictoException.js';

/** 409: the user already complained about the report (HU 5.4 c3). */
export class DenunciaDuplicadaException extends ConflictoException {
  constructor() {
    super(CodigoError.DENUNCIA_DUPLICADA, 'Esta denuncia ya fue registrada.');
  }
}
