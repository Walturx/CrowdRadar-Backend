import type { Sequelize } from 'sequelize';
import { initUser } from '../../../../models/User.js';
import { initUsuarioModel } from './UsuarioModel.js';

/** Registers every Sequelize model on the instance. Models are added slice by slice. */
export function initModels(sequelize: Sequelize): void {
  initUser(sequelize); // legacy Sprint 1 model, removed with the legacy code in BE-05b
  initUsuarioModel(sequelize);
}
