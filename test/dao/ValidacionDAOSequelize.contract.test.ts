/** Same contract against real PostgreSQL (opt-in: DATABASE_URL_TEST). */
import { ValidacionDAOSequelize } from '../../src/dao/impl/sequelize/ValidacionDAOSequelize.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';
import { contratoValidacionDAO } from './ValidacionDAO.contract.js';

ejecutarContratoDAO({
  titulo: 'ValidacionDAOSequelize (PostgreSQL)',
  contrato: contratoValidacionDAO,
  crearEntorno: (sequelize) => ({ dao: new ValidacionDAOSequelize(), sembrador: crearSembradorSequelize(sequelize) }),
});
