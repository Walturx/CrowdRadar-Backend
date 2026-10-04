import { CodigoError } from '../CodigoError.js';
import { RecursoNoEncontradoException } from '../http/RecursoNoEncontradoException.js';

/** 404: the place is not a favourite of the caller (a favourite of someone else looks the same, on purpose). */
export class FavoritoNoEncontradoException extends RecursoNoEncontradoException {
  constructor() {
    super(CodigoError.FAVORITO_NO_ENCONTRADO, 'Este lugar no está en tus favoritos.');
  }
}
