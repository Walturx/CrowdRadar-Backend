import { CodigoError } from '../CodigoError.js';
import { ConflictoException } from '../http/ConflictoException.js';

/** 409: the place is already a favourite of the user (HU 8.1 c3). */
export class FavoritoDuplicadoException extends ConflictoException {
  constructor() {
    super(CodigoError.FAVORITO_DUPLICADO, 'Este lugar ya pertenece a tus favoritos.');
  }
}
