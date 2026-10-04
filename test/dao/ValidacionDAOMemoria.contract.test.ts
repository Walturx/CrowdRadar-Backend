import { ValidacionDAOMemoria } from '../support/dao/memoria/ValidacionDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoValidacionDAO } from './ValidacionDAO.contract.js';

contratoValidacionDAO('memoria', async () => ({ dao: new ValidacionDAOMemoria(), sembrador: crearSembradorMemoria() }));
