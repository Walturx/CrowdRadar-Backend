import jwt from 'jsonwebtoken';
import type { UsuarioToken } from '../types/express.js';

class Jwt {
  generateToken(user: { id: number; email: string; rol: string | null }): string {
    return jwt.sign({ id: user.id, email: user.email, rol: user.rol }, process.env.JWT_SECRETO ?? '', {
      expiresIn: '2h',
    });
  }

  verifyToken(token: string): UsuarioToken {
    return jwt.verify(token, process.env.JWT_SECRETO ?? '') as UsuarioToken;
  }
}

export default new Jwt();
