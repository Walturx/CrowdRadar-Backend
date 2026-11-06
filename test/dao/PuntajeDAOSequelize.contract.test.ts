/**
 * Same contract against real PostgreSQL (opt-in: DATABASE_URL_TEST), plus the boundary cases that need more votes than
 * a contract can seed: the SQL expression of the validation state is evaluated on raw (confirmaciones, votos) counts and
 * compared with the TypeScript rule `estadoValidacionPorConteo`, for the default rule and for a stricter one.
 */
import { QueryTypes, type Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';
import { ReporteDAOSequelize } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { PuntajeDAOSequelize, sqlEstadoValidacion } from '../../src/dao/impl/sequelize/PuntajeDAOSequelize.js';
import { ValidacionDAOSequelize } from '../../src/dao/impl/sequelize/ValidacionDAOSequelize.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import {
  estadoValidacionPorConteo,
  type ReglaEstadoValidacion,
} from '../../src/pattern/strategy/confiabilidad/derivarEstadoValidacion.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { ejecutarContratoDAO } from './ejecutarContratoDAO.js';
import { contratoPuntajeDAO, REGLA, type EntornoPuntajeDAO } from './PuntajeDAO.contract.js';

ejecutarContratoDAO<EntornoPuntajeDAO>({
  titulo: 'PuntajeDAOSequelize (PostgreSQL)',
  contrato: contratoPuntajeDAO,
  crearEntorno: async (sequelize) => {
    const sembrador = crearSembradorSequelize(sequelize);
    const lugarId = await sembrador.lugar();
    const validaciones = new ValidacionDAOSequelize();
    const reportes = new ReporteDAOSequelize();
    let consultas = 0;
    sequelize.addHook('beforeQuery', 'contarConsultasPuntaje', () => {
      consultas += 1;
    });
    return {
      dao: new PuntajeDAOSequelize(),
      usuario: () => sembrador.usuario(),
      reporte: (autorId) => sembrador.reporte(autorId, lugarId),
      votar: async (usuarioId, reporteId, tipoAccion) => {
        await validaciones.crear({ reporteId, usuarioId, tipoAccion, fechaHora: new Date() });
      },
      eliminar: async (reporteId) => {
        await reportes.actualizarEstado(reporteId, EstadoReporte.ELIMINADO);
      },
      lecturas: () => consultas,
      cerrar: () => sequelize.removeHook('beforeQuery', 'contarConsultasPuntaje'),
    };
  },
});

/** (confirmaciones, votos) pairs around every boundary of the rule. */
const CONTEOS: [number, number][] = [
  [0, 1],
  [2, 2],
  [3, 3],
  [9, 9],
  [0, 9],
  [10, 10],
  [0, 10],
  [7, 10], // 70.00: ALTA
  [6, 10], // 60.00: MEDIA
  [4, 10], // 40.00: MEDIA
  [3, 10], // 30.00: BAJA
  [13, 19], // 68.42
  [7, 18], // 38.89
  [6999, 10000], // 69.99: MEDIA
  [7000, 10000], // 70.00
  [69995, 100000], // 69.995 rounds half up to 70.00
  [69994, 100000], // 69.994 rounds down to 69.99
  [39995, 100000], // 39.995 rounds half up to 40.00
  [39994, 100000], // 39.99
  [2, 3], // 66.67
  [1, 3], // 33.33
];

const REGLA_ESTRICTA: ReglaEstadoValidacion = { minVotos: 5, umbralAlta: 67, umbralMedia: 34, minVotosEstado: 3 };

function contratoReglaSql(nombre: string, crearEntorno: () => Promise<{ sequelize: Sequelize }>): void {
  describe(`regla de estado en SQL vs TypeScript: ${nombre}`, () => {
    it.each([
      ['la regla por defecto', REGLA],
      ['una regla mas estricta (min 5 votos, umbrales 67 y 34)', REGLA_ESTRICTA],
    ])('coinciden en todos los bordes con %s', async (_titulo, regla) => {
      const { sequelize } = await crearEntorno();
      const valores = CONTEOS.map((_, i) => `(CAST(:c${i} AS bigint), CAST(:n${i} AS bigint))`).join(', ');
      const reemplazos = Object.fromEntries(CONTEOS.flatMap(([c, n], i) => [[`c${i}`, c], [`n${i}`, n]]));
      const filas = await sequelize.query<{ c: string; n: string; estado: string | null }>(
        `SELECT c, n, ${sqlEstadoValidacion('n', 'c')} AS estado FROM (VALUES ${valores}) AS t(c, n)`,
        { replacements: { ...reemplazos, ...regla }, type: QueryTypes.SELECT },
      );
      const sql = filas.map((f) => [Number(f.c), Number(f.n), f.estado ?? 'EN_VALIDACION']);
      const ts = CONTEOS.map(([c, n]) => [c, n, estadoValidacionPorConteo(c, n, regla)]);
      expect(sql).toEqual(ts);
    });
  });
}

ejecutarContratoDAO({ titulo: 'sqlEstadoValidacion (PostgreSQL)', contrato: contratoReglaSql, crearEntorno: (sequelize) => ({ sequelize }) });
