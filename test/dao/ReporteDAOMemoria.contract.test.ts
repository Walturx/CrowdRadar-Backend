import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoReporteDAO } from './ReporteDAO.contract.js';

contratoReporteDAO('memoria', async () => ({ dao: new ReporteDAOMemoria(), sembrador: crearSembradorMemoria() }));
