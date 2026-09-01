import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { contratoUsuarioDAO } from './UsuarioDAO.contract.js';

contratoUsuarioDAO('memoria', async () => ({ dao: new UsuarioDAOMemoria() }));
