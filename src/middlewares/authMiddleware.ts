import type { NextFunction, Request, Response } from 'express';
import jwt from '../utils/jwt.js';

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Token no proporcionado.' });
  }

  const token = authHeader.split(' ')[1] ?? '';

  try {
    req.user = jwt.verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido.' });
  }
};

export default authMiddleware;
