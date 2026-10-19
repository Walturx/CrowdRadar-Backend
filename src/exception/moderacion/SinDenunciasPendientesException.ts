import { CodigoError } from '../CodigoError.js';
import { ConflictoException } from '../http/ConflictoException.js';

/** 409: the report has no PENDIENTE complaints to resolve (already resolved by another admin, or never complained about). */
export class SinDenunciasPendientesException extends ConflictoException {
  constructor() {
    super(CodigoError.SIN_DENUNCIAS_PENDIENTES, 'El reporte no tiene denuncias pendientes.');
  }
}
