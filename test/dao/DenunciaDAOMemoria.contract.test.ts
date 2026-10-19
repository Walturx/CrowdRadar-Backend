import { DenunciaDAOMemoria } from '../support/dao/memoria/DenunciaDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoDenunciaDAO } from './DenunciaDAO.contract.js';

contratoDenunciaDAO('memoria', async () => {
  const sembrador = crearSembradorMemoria();
  const eliminados = new Set<number>();
  return {
    dao: new DenunciaDAOMemoria({ sembrador, reporteEliminado: (reporteId) => eliminados.has(reporteId) }),
    sembrador,
    eliminarReporte: async (reporteId) => void eliminados.add(reporteId),
  };
});
