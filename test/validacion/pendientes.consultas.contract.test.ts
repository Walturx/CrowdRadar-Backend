/**
 * ValidacionServiceImpl.listarPendientes against real PostgreSQL (opt-in: DATABASE_URL_TEST). Each item carries its
 * author's tier (C8), and the authors' points of the whole page come from one read (`PuntajeService.obtenerVarios`):
 * the SQL a page costs does not grow with the page size (no N+1). The places nearby, the candidate reports, the votes of
 * the page and the authors' points are each one read.
 */
import { QueryTypes, type Sequelize } from 'sequelize';
import { afterEach, describe, expect, it } from 'vitest';
import { DenunciaDAOSequelize } from '../../src/dao/impl/sequelize/DenunciaDAOSequelize.js';
import { LugarDAOSequelize } from '../../src/dao/impl/sequelize/LugarDAOSequelize.js';
import { PuntajeDAOSequelize } from '../../src/dao/impl/sequelize/PuntajeDAOSequelize.js';
import { ReporteDAOSequelize } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { UsuarioDAOSequelize } from '../../src/dao/impl/sequelize/UsuarioDAOSequelize.js';
import { ValidacionDAOSequelize } from '../../src/dao/impl/sequelize/ValidacionDAOSequelize.js';
import { ConexionSequelize } from '../../src/datasource/impl/ConexionSequelize.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { ConfiabilidadSimpleStrategy } from '../../src/pattern/strategy/confiabilidad/impl/ConfiabilidadSimpleStrategy.js';
import { PuntajeServiceImpl } from '../../src/service/impl/PuntajeServiceImpl.js';
import { ValidacionServiceImpl } from '../../src/service/impl/ValidacionServiceImpl.js';
import type { PuntajeService } from '../../src/service/PuntajeService.js';
import { relojSistema } from '../../src/util/Reloj.js';
import { ejecutarContratoDAO } from '../dao/ejecutarContratoDAO.js';
import { crearSembradorSequelize } from '../support/dao/sequelize/SembradorSequelize.js';
import { REGLA_PRUEBA } from '../support/puntajePrueba.js';

/** Places nearby, candidate reports (page and total), votes of the page, authors' points. */
const MAX_CONSULTAS_PAGINA = 5;
/** Where the Sembrador puts every place. */
const CENTRO = { lat: -12.05, lng: -77.04 };
const AUTORES = 12;

/** Hooks the environments added to the shared Sequelize instance; removed after each test so they do not pile up. */
const limpiezas: (() => void)[] = [];
let siguienteHook = 0;

interface Entorno {
  servicio: ValidacionServiceImpl;
  puntajeService: PuntajeService;
  sequelize: Sequelize;
  usuario(): Promise<number>;
  lugar(): Promise<number>;
  reporte(autorId: number, lugarId: number): Promise<number>;
  /** A VALIDADO report of `autorId` (10 CONFIRMAR of new users), dated two days ago so it is not pending. */
  validadoAntiguo(autorId: number, lugarId: number): Promise<void>;
  /** Runs `trabajo` and returns how many SQL statements it sent. */
  contar<T>(trabajo: () => Promise<T>): Promise<{ resultado: T; consultas: number }>;
}

function armar(sequelize: Sequelize): Entorno {
  const sembrador = crearSembradorSequelize(sequelize);
  const reporteDAO = new ReporteDAOSequelize();
  const validacionDAO = new ValidacionDAOSequelize();
  const puntajeService = new PuntajeServiceImpl({ puntajeDAO: new PuntajeDAOSequelize(), regla: REGLA_PRUEBA });
  const servicio = new ValidacionServiceImpl({
    reporteDAO,
    lugarDAO: new LugarDAOSequelize({ limiteMax: 500 }),
    validacionDAO,
    denunciaDAO: new DenunciaDAOSequelize(),
    usuarioDAO: new UsuarioDAOSequelize(),
    puntajeService,
    estrategia: new ConfiabilidadSimpleStrategy(REGLA_PRUEBA),
    conexion: new ConexionSequelize(sequelize),
    reloj: relojSistema,
    minVotosEstado: REGLA_PRUEBA.minVotosEstado,
    limiteLugares: 500,
  });
  let consultas = 0;
  const hook = `contarConsultasPendientes${(siguienteHook += 1)}`;
  sequelize.addHook('beforeQuery', hook, () => {
    consultas += 1;
  });
  limpiezas.push(() => sequelize.removeHook('beforeQuery', hook));
  return {
    servicio,
    puntajeService,
    sequelize,
    usuario: () => sembrador.usuario(),
    lugar: () => sembrador.lugar(),
    reporte: (autorId, lugarId) => sembrador.reporte(autorId, lugarId),
    async validadoAntiguo(autorId, lugarId) {
      const reporteId = await sembrador.reporte(autorId, lugarId);
      for (let i = 0; i < 10; i += 1) {
        await validacionDAO.crear({ reporteId, usuarioId: await sembrador.usuario(), tipoAccion: TipoAccionValidacion.CONFIRMAR, fechaHora: new Date() });
      }
      await sequelize.query(`UPDATE reporte_saturacion SET fecha_hora = now() - interval '2 days' WHERE id = :reporteId`, {
        replacements: { reporteId },
        type: QueryTypes.UPDATE,
      });
    },
    async contar(trabajo) {
      const antes = consultas;
      const resultado = await trabajo();
      return { resultado, consultas: consultas - antes };
    },
  };
}

ejecutarContratoDAO<Entorno>({
  titulo: 'ValidacionServiceImpl.listarPendientes: tier del autor y consultas por pagina (PostgreSQL)',
  contrato: (nombre, crearEntorno) => {
    describe(`pendientes con el tier del autor, sin N+1 (${nombre})`, () => {
      afterEach(() => limpiezas.splice(0).forEach((limpiar) => limpiar()));

      it(`una pagina de 2, de ${AUTORES} o de 50 reportes cuesta las mismas consultas (a lo sumo ${MAX_CONSULTAS_PAGINA}) y cada uno trae el tier de su autor`, async () => {
        const { servicio, puntajeService, usuario, lugar, reporte, validadoAntiguo, contar } = await crearEntorno();
        const visor = await usuario();
        const lugarId = await lugar();
        const autores: number[] = [];
        for (let i = 0; i < AUTORES; i += 1) autores.push(await usuario());
        for (let i = 0; i < 5; i += 1) await validadoAntiguo(autores[0]!, lugarId); // 50 points: CROWD_EXPLORER
        const autorDe = new Map<number, number>();
        for (const autor of autores) autorDe.set(await reporte(autor, lugarId), autor);

        const consulta = { ...CENTRO, radioKm: 1, horas: 3, page: 1 };
        const medidas: number[] = [];
        for (const size of [2, AUTORES, 50]) {
          const { resultado, consultas } = await contar(() => servicio.listarPendientes(visor, { ...consulta, size }));
          medidas.push(consultas);
          expect(resultado.total).toBe(AUTORES);
          expect(resultado.items).toHaveLength(Math.min(size, AUTORES));
          for (const item of resultado.items) {
            const autor = autorDe.get(item.reporte.id)!;
            expect(item.reporte.usuarioId).toBe(autor);
            expect(item.tierAutor).toBe((await puntajeService.obtener(autor)).tier);
          }
        }
        expect(medidas[0]).toBeGreaterThanOrEqual(1); // the counter does see the statements
        expect(medidas[0]).toBeLessThanOrEqual(MAX_CONSULTAS_PAGINA);
        expect(new Set(medidas).size).toBe(1);
        const tiers = new Set((await servicio.listarPendientes(visor, { ...consulta, size: 50 })).items.map((i) => i.tierAutor));
        expect(tiers).toEqual(new Set(['CROWD_EXPLORER', 'CROWD_BABY']));
      });
    });
  },
  crearEntorno: (sequelize) => armar(sequelize),
});
