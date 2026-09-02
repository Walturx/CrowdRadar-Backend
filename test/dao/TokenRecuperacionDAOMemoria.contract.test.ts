import { TokenRecuperacionDAOMemoria } from '../support/dao/memoria/TokenRecuperacionDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoTokenRecuperacionDAO } from './TokenRecuperacionDAO.contract.js';

contratoTokenRecuperacionDAO('memoria', async () => ({ dao: new TokenRecuperacionDAOMemoria(), sembrador: crearSembradorMemoria() }));
