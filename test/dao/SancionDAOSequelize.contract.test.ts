/** Same contract against real PostgreSQL (opt-in: DATABASE_URL_TEST). */
import { SancionDAOSequelize } from '../../src/dao/impl/sequelize/SancionDAOSequelize.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { contratoSancionDAO } from './SancionDAO.contract.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';

ejecutarContratoDAO({
  titulo: 'SancionDAOSequelize (PostgreSQL)',
  contrato: contratoSancionDAO,
  crearEntorno: (sequelize) => ({ dao: new SancionDAOSequelize(), sembrador: crearSembradorSequelize(sequelize) }),
});
