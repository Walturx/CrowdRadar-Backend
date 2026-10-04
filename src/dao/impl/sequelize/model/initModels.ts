import type { Sequelize } from 'sequelize';
import { initLugarModel } from './LugarModel.js';
import { initReporteModel } from './ReporteModel.js';
import { initUsuarioModel } from './UsuarioModel.js';

/** Registers every Sequelize model on the instance. Models are added slice by slice. */
export function initModels(sequelize: Sequelize): void {
  initUsuarioModel(sequelize);
  initLugarModel(sequelize);
  initReporteModel(sequelize);
}
