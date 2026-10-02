import type { LugarDAO } from '../../../src/dao/LugarDAO.js';
import type { ReporteDAO } from '../../../src/dao/ReporteDAO.js';
import type { UsuarioDAO } from '../../../src/dao/UsuarioDAO.js';
import type { ConexionBD } from '../../../src/datasource/ConexionBD.js';
import { ReporteFacadeImpl } from '../../../src/facade/impl/ReporteFacadeImpl.js';
import type { SaturacionSubject } from '../../../src/pattern/observer/SaturacionSubject.js';
import { SaturacionUltimoReporteStrategy } from '../../../src/pattern/strategy/saturacion/impl/SaturacionUltimoReporteStrategy.js';
import { KarmaServiceImpl } from '../../../src/service/impl/KarmaServiceImpl.js';
import { ReporteServiceImpl } from '../../../src/service/impl/ReporteServiceImpl.js';
import { SaturacionServiceImpl } from '../../../src/service/impl/SaturacionServiceImpl.js';
import type { Reloj } from '../../../src/util/Reloj.js';
import { ConexionFalsa } from '../ConexionFalsa.js';
import { crearLoggerSilencioso } from '../LoggerSilencioso.js';
import { RelojFijo } from '../RelojFijo.js';
import { LugarDAOMemoria } from '../dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../dao/memoria/ReporteDAOMemoria.js';
import { UsuarioDAOMemoria } from '../dao/memoria/UsuarioDAOMemoria.js';

export const INSTANTE_PRUEBA = new Date('2026-10-05T15:00:00Z');

export interface DependenciasFacadePrueba {
  usuarioDAO: UsuarioDAO;
  lugarDAO: LugarDAO;
  reporteDAO: ReporteDAO;
  conexion: ConexionBD;
  reloj: Reloj;
  subject?: SaturacionSubject;
}

/** Real services with the production numbers (cooldown 30, +10 karma, cap 5 per day) and the latest-report strategy. */
export function crearFacadePrueba(deps: DependenciasFacadePrueba): ReporteFacadeImpl {
  const { usuarioDAO, lugarDAO, reporteDAO, conexion, reloj } = deps;
  return new ReporteFacadeImpl({
    lugarDAO,
    conexion,
    reporteService: new ReporteServiceImpl({ reporteDAO, lugarDAO, reloj, cooldownMin: 30 }),
    karmaService: new KarmaServiceImpl({
      usuarioDAO,
      reporteDAO,
      reloj,
      karmaPorReporte: 10,
      karmaPorValidacion: 2,
      reportesPremiadosPorDia: 5,
      zonaHoraria: 'America/Lima',
    }),
    saturacionService: new SaturacionServiceImpl({
      lugarDAO,
      reporteDAO,
      estrategia: new SaturacionUltimoReporteStrategy({ ventanaMin: 60 }),
      reloj,
      ventanaMin: 60,
    }),
    subject: deps.subject ?? { suscribir: () => {}, notificar: async () => {} },
    logger: crearLoggerSilencioso(),
  });
}

/** ReporteDAO that yields before inserting, so two unserialized transactions would both pass the cooldown check. */
export class ReporteDAOLento extends ReporteDAOMemoria {
  override async crear(...argumentos: Parameters<ReporteDAOMemoria['crear']>) {
    await new Promise<void>((resolver) => setTimeout(resolver, 5));
    return super.crear(...argumentos);
  }
}

const DATOS_USUARIO = { nombre: 'Ana', apellido: 'Perez', passwordHash: 'h', telefono: null, distrito: null };

/** Everything in memory: two users, one place, in-memory transactions that emulate the advisory lock. */
export async function armarFacadeConMemoria(opciones: { insercionLenta?: boolean } = {}) {
  const reloj = new RelojFijo(INSTANTE_PRUEBA);
  const usuarioDAO = new UsuarioDAOMemoria();
  const lugarDAO = new LugarDAOMemoria();
  const reporteDAO = opciones.insercionLenta ? new ReporteDAOLento() : new ReporteDAOMemoria();
  const usuarioId = (await usuarioDAO.crear({ ...DATOS_USUARIO, email: 'ana@crowdradar.pe' })).id;
  const otroUsuarioId = (await usuarioDAO.crear({ ...DATOS_USUARIO, email: 'luis@crowdradar.pe' })).id;
  const lugarId = lugarDAO.agregar().id;
  const facade = crearFacadePrueba({ usuarioDAO, lugarDAO, reporteDAO, conexion: new ConexionFalsa(), reloj });
  return { facade, usuarioDAO, lugarDAO, reporteDAO, usuarioId, otroUsuarioId, lugarId, reloj };
}
