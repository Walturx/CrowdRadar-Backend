import { DispositivoDAOMemoria } from '../support/dao/memoria/DispositivoDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoDispositivoDAO } from './DispositivoDAO.contract.js';

contratoDispositivoDAO('memoria', async () => {
  const sembrador = crearSembradorMemoria();
  return { dao: new DispositivoDAOMemoria({ sembrador }), sembrador };
});
