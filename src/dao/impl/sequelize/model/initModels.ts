import type { Sequelize } from 'sequelize';
import { initUser } from '../../../../models/User.js';

/** Registers every Sequelize model on the instance. Models are added slice by slice. */
export function initModels(sequelize: Sequelize): void {
  initUser(sequelize);
}
