/** Same contract against real PostgreSQL (opt-in: DATABASE_URL_TEST); the alerts DAO enables the ON DELETE CASCADE case. */
import { AlertaDAOSequelize } from '../../src/dao/impl/sequelize/AlertaDAOSequelize.js';
import { FavoritoDAOSequelize } from '../../src/dao/impl/sequelize/FavoritoDAOSequelize.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';
import { contratoFavoritoDAO } from './FavoritoDAO.contract.js';

ejecutarContratoDAO({
  titulo: 'FavoritoDAOSequelize (PostgreSQL)',
  contrato: contratoFavoritoDAO,
  crearEntorno: (sequelize) => ({
    dao: new FavoritoDAOSequelize(),
    sembrador: crearSembradorSequelize(sequelize),
    alertas: new AlertaDAOSequelize(),
  }),
});
