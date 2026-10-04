import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { contratoConcurrenciaReporteDAO } from './ReporteDAO.concurrencia.contract.js';

contratoConcurrenciaReporteDAO('memoria', async () => {
  const sembrador = crearSembradorMemoria();
  return { dao: new ReporteDAOMemoria({ sembrador }), sembrador, conexion: new ConexionFalsa() };
});
