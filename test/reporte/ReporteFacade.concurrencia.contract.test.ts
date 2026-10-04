/**
 * ReporteFacadeImpl.registrar against real PostgreSQL (opt-in: DATABASE_URL_TEST): two simultaneous reports of the
 * same user and place must end as one success and one 422 REPORTE_EN_ESPERA, with a single row, thanks to
 * pg_advisory_xact_lock taken in ReporteDAOSequelize.buscarUltimoDeUsuarioEnLugar (spec M4 R3, S6).
 * The place DAO is the in-memory one (the Sequelize LugarDAO belongs to M2); the place row exists in the database
 * only to satisfy the foreign key.
 */
import { describe, expect, it } from 'vitest';
import { ReporteDAOSequelize } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { UsuarioDAOSequelize } from '../../src/dao/impl/sequelize/UsuarioDAOSequelize.js';
import { ConexionSequelize } from '../../src/datasource/impl/ConexionSequelize.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import type { ReporteFacade } from '../../src/facade/ReporteFacade.js';
import { ejecutarContratoDAO } from '../dao/ejecutarContratoDAO.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { crearFacadePrueba, INSTANTE_PRUEBA } from '../support/reporte/armarFacade.js';

interface EntornoFacadeBD {
  facade: ReporteFacade;
  reporteDAO: ReporteDAOSequelize;
  usuarioId: number;
  otroUsuarioId: number;
  lugarId: number;
}

ejecutarContratoDAO<EntornoFacadeBD>({
  titulo: 'ReporteFacadeImpl concurrencia (PostgreSQL)',
  contrato: (nombre, crearEntorno) => {
    describe(`ReporteFacadeImpl.registrar: concurrencia (${nombre})`, () => {
      it('dos registrar simultaneos del mismo usuario y lugar: uno 201 y otro 422, una sola fila', async () => {
        const { facade, reporteDAO, usuarioId, lugarId } = await crearEntorno();
        const resultados = await Promise.allSettled([
          facade.registrar(usuarioId, lugarId, NivelSaturacion.MODERADO),
          facade.registrar(usuarioId, lugarId, NivelSaturacion.SATURADO),
        ]);
        expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
        const rechazado = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(rechazado?.reason).toMatchObject({ status: 422, code: CodigoError.REPORTE_EN_ESPERA });
        expect((await reporteDAO.listarPorUsuario(usuarioId, { page: 1, size: 10 })).total).toBe(1);
      });

      it('usuarios distintos sobre el mismo lugar no se bloquean: ambos reportan', async () => {
        const { facade, reporteDAO, usuarioId, otroUsuarioId, lugarId } = await crearEntorno();
        const resultados = await Promise.allSettled([
          facade.registrar(usuarioId, lugarId, NivelSaturacion.MODERADO),
          facade.registrar(otroUsuarioId, lugarId, NivelSaturacion.MODERADO),
        ]);
        expect(resultados.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
        expect(await reporteDAO.contarPorLugarDesde(lugarId, new Date(0))).toBe(2);
      });
    });
  },
  crearEntorno: async (sequelize) => {
    const sembrador = crearSembradorSequelize(sequelize);
    const usuarioId = await sembrador.usuario();
    const otroUsuarioId = await sembrador.usuario();
    const lugarId = await sembrador.lugar();
    const lugarDAO = new LugarDAOMemoria();
    lugarDAO.agregar({ id: lugarId });
    const reporteDAO = new ReporteDAOSequelize();
    const facade = crearFacadePrueba({
      usuarioDAO: new UsuarioDAOSequelize(),
      lugarDAO,
      reporteDAO,
      conexion: new ConexionSequelize(sequelize),
      reloj: new RelojFijo(INSTANTE_PRUEBA),
    });
    return { facade, reporteDAO, usuarioId, otroUsuarioId, lugarId };
  },
});
