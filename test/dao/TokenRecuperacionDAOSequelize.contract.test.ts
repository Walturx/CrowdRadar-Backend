/** Same contract against real PostgreSQL (opt-in: DATABASE_URL_TEST); runs on a throwaway migrated database. */
import { TokenRecuperacionDAOSequelize } from '../../src/dao/impl/sequelize/TokenRecuperacionDAOSequelize.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';
import { contratoTokenRecuperacionDAO } from './TokenRecuperacionDAO.contract.js';

ejecutarContratoDAO({
  titulo: 'TokenRecuperacionDAOSequelize (PostgreSQL)',
  contrato: contratoTokenRecuperacionDAO,
  crearEntorno: (sequelize) => ({ dao: new TokenRecuperacionDAOSequelize(), sembrador: crearSembradorSequelize(sequelize) }),
});
