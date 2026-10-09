import type { Sequelize } from 'sequelize';
import { initLugarModel } from './LugarModel.js';
import { initReporteModel } from './ReporteModel.js';
import { initAlertaModel } from './AlertaModel.js';
import { initDispositivoModel } from './DispositivoModel.js';
import { initFavoritoModel } from './FavoritoModel.js';
import { initTokenRecuperacionModel } from './TokenRecuperacionModel.js';
import { initUsuarioModel } from './UsuarioModel.js';
import { initValidacionModel } from './ValidacionModel.js';
import { initDenunciaModel } from './DenunciaModel.js';

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
}
