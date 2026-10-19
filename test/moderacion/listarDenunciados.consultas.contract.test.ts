/**
 * ModeracionFacadeImpl.listarReportesDenunciados against real PostgreSQL (opt-in: DATABASE_URL_TEST). The review
 * queue must not grow its SQL with the page size (the N+1 of the baseline ran 2 + 3 per item): one page query that
 * also carries the total (COUNT(*) OVER ()) and one batch read of report, place and author.
 */
import { QueryTypes, type Sequelize } from 'sequelize';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextoReporteDAOSequelize } from '../../src/dao/impl/sequelize/ContextoReporteDAOSequelize.js';
import { DenunciaDAOSequelize } from '../../src/dao/impl/sequelize/DenunciaDAOSequelize.js';
import { LugarDAOSequelize } from '../../src/dao/impl/sequelize/LugarDAOSequelize.js';
import { ReporteDAOSequelize } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { UsuarioDAOSequelize } from '../../src/dao/impl/sequelize/UsuarioDAOSequelize.js';
import { ConexionSequelize } from '../../src/datasource/impl/ConexionSequelize.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { ModeracionFacadeImpl } from '../../src/facade/impl/ModeracionFacadeImpl.js';
import { ejecutarContratoDAO } from '../dao/ejecutarContratoDAO.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';

const MAX_CONSULTAS_POR_PAGINA = 2;

/** Hooks the environments added to the shared Sequelize instance; removed after each test so they do not pile up. */
const limpiezas: (() => void)[] = [];
let siguienteHook = 0;

interface Entorno {
  facade: ModeracionFacadeImpl;
  sequelize: Sequelize;
  /** Seeds a report of a new author on a new place with `n` pending complaints; returns its ids. */
  denunciado(n: number): Promise<{ reporteId: number; autorId: number; lugarId: number }>;
  /** Runs `trabajo` and returns how many SQL statements it sent. */
  contar<T>(trabajo: () => Promise<T>): Promise<{ resultado: T; consultas: number }>;
}

function armar(sequelize: Sequelize): Entorno {
  const sembrador = crearSembradorSequelize(sequelize);
  const usuarioDAO = new UsuarioDAOSequelize();
  const reporteDAO = new ReporteDAOSequelize();
  const facade = new ModeracionFacadeImpl({
    usuarioDAO,
    sancionDAO: {} as never,
    denunciaDAO: new DenunciaDAOSequelize(),
    reporteDAO,
    lugarDAO: new LugarDAOSequelize({ limiteMax: 500 }),
    contextoReporteDAO: new ContextoReporteDAOSequelize(),
    karmaService: {} as never,
    saturacionService: {} as never,
    subject: {} as never,
    correo: {} as never,
    conexion: new ConexionSequelize(sequelize),
    reloj: new RelojFijo(new Date('2026-10-05T14:00:00Z')),
    logger: crearLoggerSilencioso(),
    diasPermitidos: [3, 7, 30],
  });
  let consultas = 0;
  const hook = `contarConsultasCola${(siguienteHook += 1)}`;
  sequelize.addHook('beforeQuery', hook, () => {
    consultas += 1;
  });
  limpiezas.push(() => sequelize.removeHook('beforeQuery', hook));
  return {
    facade,
    sequelize,
    async denunciado(n) {
      const autorId = await sembrador.usuario();
      const lugarId = await sembrador.lugar();
      const reporteId = await sembrador.reporte(autorId, lugarId);
      for (let i = 0; i < n; i++) {
        await sequelize.query(
          `INSERT INTO denuncia (reporte_id, usuario_id, motivo, fecha_hora) VALUES (:reporteId, :usuarioId, 'INFORMACION_FALSA', now())`,
          { replacements: { reporteId, usuarioId: await sembrador.usuario() }, type: QueryTypes.INSERT },
        );
      }
      return { reporteId, autorId, lugarId };
    },
    async contar(trabajo) {
      const antes = consultas;
      const resultado = await trabajo();
      return { resultado, consultas: consultas - antes };
    },
  };
}

ejecutarContratoDAO<Entorno>({
  titulo: 'ModeracionFacadeImpl.listarReportesDenunciados: consultas por pagina (PostgreSQL)',
  contrato: (nombre, crearEntorno) => {
    describe(`cola de denunciados sin N+1 (${nombre})`, () => {
      afterEach(() => limpiezas.splice(0).forEach((limpiar) => limpiar()));

      it(`una pagina de varios reportes cuesta a lo sumo ${MAX_CONSULTAS_POR_PAGINA} consultas y trae reporte, lugar y autor`, async () => {
        const { facade, sequelize, denunciado, contar } = await crearEntorno();
        await sequelize.query('DELETE FROM denuncia');
        const sembrados = [];
        for (let i = 1; i <= 6; i++) sembrados.push(await denunciado(i));

        const { resultado, consultas } = await contar(() => facade.listarReportesDenunciados({ page: 1, size: 20 }));

        expect(consultas).toBeGreaterThanOrEqual(1); // the counter does see the statements
        expect(consultas).toBeLessThanOrEqual(MAX_CONSULTAS_POR_PAGINA);
        expect(resultado.total).toBe(6);
        expect(resultado.items.map((i) => [i.reporteId, i.pendientes])).toEqual(
          [...sembrados].reverse().map((s, k) => [s.reporteId, 6 - k]),
        );
        for (const item of resultado.items) {
          const sembrado = sembrados.find((s) => s.reporteId === item.reporteId)!;
          expect(item.reporte).toMatchObject({ id: sembrado.reporteId, usuarioId: sembrado.autorId, lugarId: sembrado.lugarId, estado: EstadoReporte.ACTIVO });
          expect(item.lugar.id).toBe(sembrado.lugarId);
          expect(item.autor.id).toBe(sembrado.autorId);
          // Only the author columns the queue shows are read: no password hash, no account state.
          expect(Object.keys(item.autor).sort()).toEqual(['apellido', 'email', 'id', 'nombre']);
          expect(item.ultimaDenunciaEn).toBeInstanceOf(Date);
        }
      });

      it('las paginas siguientes y una pagina mas alla del final conservan el total sin mas consultas', async () => {
        const { facade, sequelize, denunciado, contar } = await crearEntorno();
        await sequelize.query('DELETE FROM denuncia');
        for (let i = 1; i <= 3; i++) await denunciado(i);

        const segunda = await contar(() => facade.listarReportesDenunciados({ page: 2, size: 2 }));
        expect(segunda.consultas).toBeLessThanOrEqual(MAX_CONSULTAS_POR_PAGINA);
        expect(segunda.resultado).toMatchObject({ total: 3, page: 2, size: 2 });
        expect(segunda.resultado.items).toHaveLength(1);

        const fuera = await contar(() => facade.listarReportesDenunciados({ page: 5, size: 2 }));
        expect(fuera.consultas).toBeLessThanOrEqual(MAX_CONSULTAS_POR_PAGINA);
        expect(fuera.resultado).toMatchObject({ total: 3, items: [] });
      });

      it('una pagina mixta (vigente + ELIMINADO con pendientes) lista solo el vigente, con total coherente y sin 404', async () => {
        const { facade, sequelize, denunciado } = await crearEntorno();
        await sequelize.query('DELETE FROM denuncia');
        const vigente = await denunciado(1);
        const eliminado = await denunciado(3);
        await sequelize.query(`UPDATE reporte_saturacion SET estado = 'ELIMINADO' WHERE id = :id`, { replacements: { id: eliminado.reporteId } });

        const resultado = await facade.listarReportesDenunciados({ page: 1, size: 1 });
        expect(resultado).toMatchObject({ total: 1, page: 1, size: 1 });
        expect(resultado.items.map((i) => i.reporteId)).toEqual([vigente.reporteId]);
        expect(await facade.listarReportesDenunciados({ page: 2, size: 1 })).toMatchObject({ total: 1, items: [] });
      });

      it('sin denuncias pendientes: pagina vacia con total 0', async () => {
        const { facade, sequelize, contar } = await crearEntorno();
        await sequelize.query('DELETE FROM denuncia');
        const { resultado, consultas } = await contar(() => facade.listarReportesDenunciados({ page: 1, size: 20 }));
        expect(consultas).toBeLessThanOrEqual(MAX_CONSULTAS_POR_PAGINA);
        expect(resultado).toMatchObject({ total: 0, items: [] });
      });
    });
  },
  crearEntorno: (sequelize) => armar(sequelize),
});
