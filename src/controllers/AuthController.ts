import type { Request, Response } from 'express';
import AuthService from '../services/AuthService.js';

const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : String(error));

class AuthController {
  async register(req: Request, res: Response) {
    try {
      const user = await AuthService.register(req.body);

      return res.status(201).json({
        message: 'Usuario registrado correctamente.',
        data: user,
      });
    } catch (error) {
      return res.status(400).json({ message: mensajeDe(error) });
    }
  }

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      const response = await AuthService.login(email, password);

      return res.status(200).json({
        message: 'Inicio de sesión exitoso.',
        data: response,
      });
    } catch (error) {
      return res.status(401).json({ message: mensajeDe(error) });
    }
  }
}

export default new AuthController();
