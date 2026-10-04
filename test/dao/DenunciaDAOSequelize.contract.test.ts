/** Same contract against real PostgreSQL (opt-in: DATABASE_URL_TEST). */
import { DenunciaDAOSequelize } from '../../src/dao/impl/sequelize/DenunciaDAOSequelize.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { contratoDenunciaDAO } from './DenunciaDAO.contract.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';

ejecutarContratoDAO({
  titulo: 'DenunciaDAOSequelize (PostgreSQL)',
  contrato: contratoDenunciaDAO,
  crearEntorno: (sequelize) => ({ dao: new DenunciaDAOSequelize(), sembrador: crearSembradorSequelize(sequelize) }),
});
