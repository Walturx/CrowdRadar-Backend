import type { CreationAttributes } from 'sequelize';
import User from '../models/User.js';

export type DatosPerfil = Partial<Pick<User, 'nombre' | 'apellido' | 'telefono' | 'distrito'>>;

class UserRepository {
  async create(data: CreationAttributes<User>) {
    return await User.create(data);
  }

  async findById(id: number) {
    return await User.findByPk(id, {
      attributes: { exclude: ['passwordHash'] },
    });
  }

  async findByEmail(email: string) {
    return await User.findOne({ where: { email } });
  }

  async update(id: number, data: DatosPerfil) {
    const user = await User.findByPk(id);

    if (!user) {
      return null;
    }

    await user.update(data);

    return await User.findByPk(id, {
      attributes: { exclude: ['passwordHash'] },
    });
  }
}

export default new UserRepository();
