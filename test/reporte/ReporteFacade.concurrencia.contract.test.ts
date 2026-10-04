/**
 * ReporteFacadeImpl.registrar against real PostgreSQL (opt-in: DATABASE_URL_TEST): two simultaneous reports of the
 * same user and place must end as one success and one 422 REPORTE_EN_ESPERA, with a single row, thanks to
 * pg_advisory_xact_lock taken in ReporteDAOSequelize.buscarUltimoDeUsuarioEnLugar (spec M4 R3, S6). Two different
 * users reporting the same place keep a consistent saturation (row lock of the place), and one user reporting on
 * many places never exceeds the daily karma cap (advisory lock per user).
 */
import { describe, expect, it } from 'vitest';
import { LugarDAOSequelize } from '../../src/dao/impl/sequelize/LugarDAOSequelize.js';
import { ReporteDAOSequelize } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { UsuarioDAOSequelize } from '../../src/dao/impl/sequelize/UsuarioDAOSequelize.js';
import { ConexionSequelize } from '../../src/datasource/impl/ConexionSequelize.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import type { ReporteFacade } from '../../src/facade/ReporteFacade.js';
import type { SaturacionCambiadaEvento } from '../../src/pattern/observer/SaturacionCambiadaEvento.js';
import { ejecutarContratoDAO } from '../dao/ejecutarContratoDAO.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { crearFacadePrueba, INSTANTE_PRUEBA } from '../support/reporte/armarFacade.js';

interface EntornoFacadeBD {
  facade: ReporteFacade;
  reporteDAO: ReporteDAOSequelize;
  lugarDAO: LugarDAOSequelize;
  usuarioDAO: UsuarioDAOSequelize;
  usuarioId: number;
  otroUsuarioId: number;
  lugarId: number;
  /** Seeds one more place and returns its id. */
  nuevoLugar(): Promise<number>;
  /** Events the facade published, in publish order. */
  eventos: SaturacionCambiadaEvento[];
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

      it('dos usuarios distintos sobre el mismo lugar a la vez: la saturacion final y los eventos reflejan a los dos', async () => {
        const { facade, lugarDAO, usuarioId, otroUsuarioId, lugarId, eventos } = await crearEntorno();
        await Promise.all([
          facade.registrar(usuarioId, lugarId, NivelSaturacion.SATURADO),
          facade.registrar(otroUsuarioId, lugarId, NivelSaturacion.TRANQUILO),
        ]);
        expect(eventos).toHaveLength(2);
        const primero = eventos.find((e) => e.nivelAnterior === null);
        const segundo = eventos.find((e) => e !== primero);
        expect(primero).toBeDefined();
        expect(segundo?.nivelAnterior).toBe(primero?.nivelNuevo);
        expect((await lugarDAO.buscarPorId(lugarId))?.saturacionActual).toBe(segundo?.nivelNuevo);
      });

      it('un usuario reportando en 8 lugares a la vez no supera el tope diario de karma', async () => {
        const { facade, reporteDAO, usuarioDAO, usuarioId, lugarId, nuevoLugar } = await crearEntorno();
        const lugarIds = [lugarId, ...(await Promise.all(Array.from({ length: 7 }, nuevoLugar)))];
        const resultados = await Promise.all(lugarIds.map((id) => facade.registrar(usuarioId, id, NivelSaturacion.MODERADO)));
        expect(resultados.filter((r) => r.karma.puntosGanados > 0)).toHaveLength(5);
        expect(await reporteDAO.contarPremiadosDeUsuarioDesde(usuarioId, new Date(0))).toBe(5);
        expect((await usuarioDAO.buscarPorId(usuarioId))?.puntosKarma).toBe(50);
      });
    });
  },
  crearEntorno: async (sequelize) => {
    const sembrador = crearSembradorSequelize(sequelize);
    const usuarioId = await sembrador.usuario();
    const otroUsuarioId = await sembrador.usuario();
    const lugarId = await sembrador.lugar();
    const lugarDAO = new LugarDAOSequelize({ limiteMax: 200 });
    const usuarioDAO = new UsuarioDAOSequelize();
    const reporteDAO = new ReporteDAOSequelize();
    const eventos: SaturacionCambiadaEvento[] = [];
    const facade = crearFacadePrueba({
      usuarioDAO,
      lugarDAO,
      reporteDAO,
      conexion: new ConexionSequelize(sequelize),
      reloj: new RelojFijo(INSTANTE_PRUEBA),
      subject: { suscribir: () => {}, notificar: async (e) => void eventos.push(e) },
    });
    return { facade, reporteDAO, lugarDAO, usuarioDAO, usuarioId, otroUsuarioId, lugarId, nuevoLugar: () => sembrador.lugar(), eventos };
  },
});
