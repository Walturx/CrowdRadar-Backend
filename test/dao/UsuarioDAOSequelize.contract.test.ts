/** Same contract against real PostgreSQL (opt-in: DATABASE_URL_TEST); runs on a throwaway migrated database. */
import { UsuarioDAOSequelize } from '../../src/dao/impl/sequelize/UsuarioDAOSequelize.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';
import { contratoUsuarioDAO } from './UsuarioDAO.contract.js';

ejecutarContratoDAO({
  titulo: 'UsuarioDAOSequelize (PostgreSQL)',
  contrato: contratoUsuarioDAO,
  crearEntorno: () => ({ dao: new UsuarioDAOSequelize() }),
});
