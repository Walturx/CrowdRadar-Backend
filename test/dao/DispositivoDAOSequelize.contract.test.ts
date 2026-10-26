/** Same contract against real PostgreSQL (opt-in: DATABASE_URL_TEST); runs on a throwaway migrated database. */
import { DispositivoDAOSequelize } from '../../src/dao/impl/sequelize/DispositivoDAOSequelize.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { contratoDispositivoDAO } from './DispositivoDAO.contract.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';

ejecutarContratoDAO({
  titulo: 'DispositivoDAOSequelize (PostgreSQL)',
  contrato: contratoDispositivoDAO,
  crearEntorno: (sequelize) => ({ dao: new DispositivoDAOSequelize(), sembrador: crearSembradorSequelize(sequelize) }),
});
