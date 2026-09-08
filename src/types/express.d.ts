import type { Usuario } from '../entity/Usuario.js';

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user as read from the database by `autenticar`. */
      usuario?: Usuario;
    }
  }
}
