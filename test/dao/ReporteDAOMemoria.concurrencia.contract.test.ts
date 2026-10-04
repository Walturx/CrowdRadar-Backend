import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { ValidacionDAOMemoria } from '../support/dao/memoria/ValidacionDAOMemoria.js';
import { votarEn } from './votarParaContrato.js';
import { contratoConcurrenciaReporteDAO } from './ReporteDAO.concurrencia.contract.js';

contratoConcurrenciaReporteDAO('memoria', async () => {
  const sembrador = crearSembradorMemoria();
  const validaciones = new ValidacionDAOMemoria();
  return { dao: new ReporteDAOMemoria({ sembrador, validaciones }), sembrador, conexion: new ConexionFalsa(), votar: votarEn(validaciones) };
});
