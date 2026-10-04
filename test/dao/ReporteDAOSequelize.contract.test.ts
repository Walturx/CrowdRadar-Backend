/** Same contracts against real PostgreSQL (opt-in: DATABASE_URL_TEST); runs on a throwaway migrated database. */
import { ConexionSequelize } from '../../src/datasource/impl/ConexionSequelize.js';
import { ReporteDAOSequelize } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { ValidacionDAOSequelize } from '../../src/dao/impl/sequelize/ValidacionDAOSequelize.js';
import { votarEn } from './votarParaContrato.js';
import { contratoReporteDAO } from './ReporteDAO.contract.js';
import { contratoConcurrenciaReporteDAO, type EntornoConcurrenciaReporteDAO } from './ReporteDAO.concurrencia.contract.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';

ejecutarContratoDAO<EntornoConcurrenciaReporteDAO>({
  titulo: 'ReporteDAOSequelize (PostgreSQL)',
  contrato: (nombre, crearEntorno) => {
    contratoReporteDAO(nombre, crearEntorno);
    contratoConcurrenciaReporteDAO(nombre, crearEntorno);
  },
  crearEntorno: (sequelize) => ({
    dao: new ReporteDAOSequelize(),
    sembrador: crearSembradorSequelize(sequelize),
    conexion: new ConexionSequelize(sequelize),
    votar: votarEn(new ValidacionDAOSequelize()),
  }),
});
