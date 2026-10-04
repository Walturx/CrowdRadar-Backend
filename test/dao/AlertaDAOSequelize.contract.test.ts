/** Same contract against real PostgreSQL (opt-in: DATABASE_URL_TEST); runs on a throwaway migrated database. */
import { AlertaDAOSequelize } from '../../src/dao/impl/sequelize/AlertaDAOSequelize.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { contratoAlertaDAO } from './AlertaDAO.contract.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';

ejecutarContratoDAO({
  titulo: 'AlertaDAOSequelize (PostgreSQL)',
  contrato: contratoAlertaDAO,
  crearEntorno: (sequelize) => ({ dao: new AlertaDAOSequelize(), sembrador: crearSembradorSequelize(sequelize) }),
});
