import { AlertaDAOMemoria } from '../support/dao/memoria/AlertaDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoAlertaDAO } from './AlertaDAO.contract.js';

contratoAlertaDAO('memoria', async () => ({ dao: new AlertaDAOMemoria(), sembrador: crearSembradorMemoria() }));
