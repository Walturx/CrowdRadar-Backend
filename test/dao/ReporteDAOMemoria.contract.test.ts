import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoReporteDAO } from './ReporteDAO.contract.js';

contratoReporteDAO('memoria', async () => {
  const sembrador = crearSembradorMemoria();
  return { dao: new ReporteDAOMemoria({ sembrador }), sembrador };
});
