import type { JwtPayload } from 'jsonwebtoken';

export interface UsuarioToken extends JwtPayload {
  id: number;
  email: string;
  rol: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UsuarioToken;
    }
  }
}
