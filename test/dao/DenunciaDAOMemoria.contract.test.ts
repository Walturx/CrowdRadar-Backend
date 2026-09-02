import { DenunciaDAOMemoria } from '../support/dao/memoria/DenunciaDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoDenunciaDAO } from './DenunciaDAO.contract.js';

contratoDenunciaDAO('memoria', async () => {
  const sembrador = crearSembradorMemoria();
  return { dao: new DenunciaDAOMemoria((reporteId) => sembrador.autorDe(reporteId)), sembrador };
});
