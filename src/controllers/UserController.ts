import type { Request, Response } from 'express';
import UserService from '../services/UserService.js';

const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : String(error));

class UserController {
  async getProfile(req: Request, res: Response) {
    try {
      const user = await UserService.getProfile(req.user!.id);

      return res.status(200).json({ data: user });
    } catch (error) {
      return res.status(404).json({ message: mensajeDe(error) });
    }
  }

  async updateProfile(req: Request, res: Response) {
    try {
      const user = await UserService.updateProfile(req.user!.id, req.body);

      return res.status(200).json({
        message: 'Perfil actualizado correctamente.',
        data: user,
      });
    } catch (error) {
      return res.status(400).json({ message: mensajeDe(error) });
    }
  }
}

export default new UserController();
