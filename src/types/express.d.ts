import type { JwtPayload } from 'jsonwebtoken';
import type { Usuario } from '../entity/Usuario.js';

export interface UsuarioToken extends JwtPayload {
  id: number;
  email: string;
  rol: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Sprint 1 token payload; removed with the legacy auth middleware in BE-05b. */
      user?: UsuarioToken;
      /** Authenticated user as read from the database by `autenticar`. */
      usuario?: Usuario;
    }
  }
}
