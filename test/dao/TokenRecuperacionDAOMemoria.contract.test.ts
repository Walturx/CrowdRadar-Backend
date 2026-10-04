import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { TokenRecuperacionDAOMemoria } from '../support/dao/memoria/TokenRecuperacionDAOMemoria.js';
import { contratoTokenRecuperacionDAO } from './TokenRecuperacionDAO.contract.js';

contratoTokenRecuperacionDAO('memoria', async () => {
  const sembrador = crearSembradorMemoria();
  return { dao: new TokenRecuperacionDAOMemoria({ sembrador }), sembrador };
});
