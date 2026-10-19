/**
 * ReporteFacadeImpl.registrar against real PostgreSQL (opt-in: DATABASE_URL_TEST): two simultaneous reports of the
 * same user and place must end as one success and one 422 REPORTE_EN_ESPERA, with a single row, thanks to
 * pg_advisory_xact_lock taken in ReporteDAOSequelize.buscarUltimoDeUsuarioEnLugar (spec M4 R3, S6). Two different
 * users reporting the same place keep a consistent saturation (row lock of the place), and one user reporting on
 * many places never exceeds the daily karma cap (advisory lock per user).
 */
import { afterEach, describe, expect, it } from 'vitest';
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
  /** SQL text of every statement sent so far through this environment's Sequelize instance, in send order. */
  sentencias(): string[];
}

/** Hooks the environments added to the shared Sequelize instance; removed after each test so they do not pile up. */
const limpiezas: (() => void)[] = [];
let siguienteHook = 0;

/** Index of the first statement (from `desde`) that matches; -1 when none does. */
const posicion = (sentencias: string[], patron: RegExp, desde = 0) => {
  const i = sentencias.slice(desde).findIndex((sql) => patron.test(sql));
  return i === -1 ? -1 : desde + i;
};

/**
 * Statements of one report (place check, BEGIN, 2 advisory locks, cooldown read, place row lock, insert, premiados
 * count, karma, points, recent reports, level write, COMMIT). It was 16 before phase 3 (two read-backs after UPDATE
 * and a second read of the place already locked); each one held the transaction's connection for a round trip.
 */
const MAX_SENTENCIAS_REGISTRAR = 13;

ejecutarContratoDAO<EntornoFacadeBD>({
  titulo: 'ReporteFacadeImpl concurrencia (PostgreSQL)',
  contrato: (nombre, crearEntorno) => {
    describe(`ReporteFacadeImpl.registrar: concurrencia (${nombre})`, () => {
      afterEach(() => limpiezas.splice(0).forEach((limpiar) => limpiar()));

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

      it(`un reporte cuesta a lo sumo ${MAX_SENTENCIAS_REGISTRAR} sentencias SQL (sin relecturas dentro de la transaccion)`, async () => {
        const { facade, usuarioId, lugarId, sentencias } = await crearEntorno();
        const antes = sentencias().length;
        const { reporte, lugar } = await facade.registrar(usuarioId, lugarId, NivelSaturacion.SATURADO);
        const usadas = sentencias().slice(antes);
        expect(usadas.length).toBeGreaterThan(0);
        expect(usadas.length).toBeLessThanOrEqual(MAX_SENTENCIAS_REGISTRAR);
        expect(reporte).toMatchObject({ usuarioId, lugarId, puntosOtorgados: 10, motivoSinPuntos: null });
        expect(lugar).toMatchObject({ id: lugarId, saturacionActual: NivelSaturacion.SATURADO });
      });

      it('la transaccion de un reporte toma los cerrojos en orden y suma el karma al final', async () => {
        const { facade, usuarioId, lugarId, sentencias } = await crearEntorno();
        const antes = sentencias().length;
        await facade.registrar(usuarioId, lugarId, NivelSaturacion.MODERADO);
        const usadas = sentencias().slice(antes);
        // Each step must come after the previous one: cooldown lock of the pair, then the place row lock, then the
        // insert, then the per-user lock of the daily cap, and the karma UPDATE of the user last (shortest hold).
        const pasos: [string, RegExp][] = [
          ['BEGIN', /^START TRANSACTION|^BEGIN/i],
          ['advisory(usuario, lugar)', new RegExp(`pg_advisory_xact_lock\\(${usuarioId}, ${lugarId}\\)`)],
          ['lugar FOR UPDATE', /FROM "?lugar"?.*FOR UPDATE/is],
          ['INSERT reporte', /^INSERT INTO "?reporte_saturacion"?/i],
          ['advisory(usuario, 0)', new RegExp(`pg_advisory_xact_lock\\(${usuarioId}, 0\\)`)],
          ['tope diario', /COUNT\(\*\).*puntos_otorgados > 0/is],
          ['UPDATE karma', /^UPDATE "?usuario"? SET.*puntos_karma/is],
          ['COMMIT', /^COMMIT/i],
        ];
        let desde = 0;
        const orden: [string, number][] = pasos.map(([paso, patron]) => {
          const i = posicion(usadas, patron, desde);
          if (i !== -1) desde = i + 1;
          return [paso, i];
        });
        expect(orden.filter(([, i]) => i === -1), usadas.join('\n')).toEqual([]);
        // After the karma UPDATE only the report's own points are written before COMMIT: the user's row lock (taken by
        // that UPDATE) is held for two round trips, with no other lock or read in between.
        const karma = orden.find(([paso]) => paso === 'UPDATE karma')![1];
        const despues = usadas.slice(karma + 1);
        expect(despues, usadas.join('\n')).toHaveLength(2);
        expect(despues[0]).toMatch(/^UPDATE reporte_saturacion SET "puntos_otorgados"/);
        expect(despues[1]).toMatch(/^COMMIT/);
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
    const sentencias: string[] = [];
    // afterQuery: the statement text is only set on the query once it runs. Named, so afterEach can remove it.
    const hook = `sentenciasRegistrar${(siguienteHook += 1)}`;
    sequelize.addHook('afterQuery', hook, (_opciones, consulta) => {
      sentencias.push(String((consulta as { sql?: unknown }).sql ?? '').trim());
    });
    limpiezas.push(() => sequelize.removeHook('afterQuery', hook));
    const facade = crearFacadePrueba({
      usuarioDAO,
      lugarDAO,
      reporteDAO,
      conexion: new ConexionSequelize(sequelize),
      reloj: new RelojFijo(INSTANTE_PRUEBA),
      subject: { suscribir: () => {}, notificar: async (e) => void eventos.push(e) },
    });
    return {
      facade,
      reporteDAO,
      lugarDAO,
      usuarioDAO,
      usuarioId,
      otroUsuarioId,
      lugarId,
      nuevoLugar: () => sembrador.lugar(),
      eventos,
      sentencias: () => [...sentencias],
    };
  },
});
