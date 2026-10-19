/** Same contract against real PostgreSQL (opt-in: DATABASE_URL_TEST). */
import { ContextoReporteDAOSequelize } from '../../src/dao/impl/sequelize/ContextoReporteDAOSequelize.js';
import { ReporteDAOSequelize } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { contratoContextoReporteDAO, type EntornoContextoReporteDAO } from './ContextoReporteDAO.contract.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';

ejecutarContratoDAO<EntornoContextoReporteDAO>({
  titulo: 'ContextoReporteDAOSequelize (PostgreSQL)',
  contrato: contratoContextoReporteDAO,
  crearEntorno: (sequelize) => {
    const sembrador = crearSembradorSequelize(sequelize);
    let consultas = 0;
    sequelize.addHook('beforeQuery', 'contarConsultasContexto', () => {
      consultas += 1;
    });
    return {
      dao: new ContextoReporteDAOSequelize(),
      reporteDAO: new ReporteDAOSequelize(),
      async sembrar() {
        const autorId = await sembrador.usuario();
        const lugarId = await sembrador.lugar();
        return { reporteId: await sembrador.reporte(autorId, lugarId), lugarId, autorId };
      },
      lecturas: () => consultas,
      cerrar: () => sequelize.removeHook('beforeQuery', 'contarConsultasContexto'),
    };
  },
});
