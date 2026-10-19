import type { Sequelize } from 'sequelize';
import { initLugarModel, LugarModel } from './LugarModel.js';
import { initReporteModel, ReporteModel } from './ReporteModel.js';
import { initAlertaModel } from './AlertaModel.js';
import { initDispositivoModel } from './DispositivoModel.js';
import { initFavoritoModel } from './FavoritoModel.js';
import { initTokenRecuperacionModel } from './TokenRecuperacionModel.js';
import { initUsuarioModel, UsuarioModel } from './UsuarioModel.js';
import { initValidacionModel } from './ValidacionModel.js';
import { initDenunciaModel } from './DenunciaModel.js';
import { initSancionModel } from './SancionModel.js';

/** Registers every Sequelize model on the instance. Models are added slice by slice. */
export function initModels(sequelize: Sequelize): void {
  initUsuarioModel(sequelize);
  initLugarModel(sequelize);
  initReporteModel(sequelize);
  initFavoritoModel(sequelize);
  initAlertaModel(sequelize);
  initDispositivoModel(sequelize);
  initTokenRecuperacionModel(sequelize);
  initValidacionModel(sequelize);
  initDenunciaModel(sequelize);
  initSancionModel(sequelize);
  // Read-only associations for joined reads (ContextoReporteDAOSequelize); the database already enforces the FKs.
  ReporteModel.belongsTo(LugarModel, { as: 'lugar', foreignKey: 'lugarId', constraints: false });
  ReporteModel.belongsTo(UsuarioModel, { as: 'autor', foreignKey: 'usuarioId', constraints: false });
}
