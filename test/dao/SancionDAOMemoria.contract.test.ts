import { SancionDAOMemoria } from '../support/dao/memoria/SancionDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoSancionDAO } from './SancionDAO.contract.js';

contratoSancionDAO('memoria', async () => ({ dao: new SancionDAOMemoria(), sembrador: crearSembradorMemoria() }));
