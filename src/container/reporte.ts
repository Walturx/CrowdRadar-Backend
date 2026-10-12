import type { ConfiguracionApp } from '../config/ConfiguracionApp.js';
import type { LugarDAO } from '../dao/LugarDAO.js';
import type { ReporteDAO } from '../dao/ReporteDAO.js';
import type { UsuarioDAO } from '../dao/UsuarioDAO.js';
import type { ConexionBD } from '../datasource/ConexionBD.js';
import { ReporteFacadeImpl } from '../facade/impl/ReporteFacadeImpl.js';
import type { ReporteFacade } from '../facade/ReporteFacade.js';
import type { SaturacionSubject } from '../pattern/observer/SaturacionSubject.js';
import type { EstrategiaSaturacion } from '../pattern/strategy/saturacion/EstrategiaSaturacion.js';
import { SaturacionPonderadaStrategy } from '../pattern/strategy/saturacion/impl/SaturacionPonderadaStrategy.js';
import { SaturacionUltimoReporteStrategy } from '../pattern/strategy/saturacion/impl/SaturacionUltimoReporteStrategy.js';
import { AnaliticaController } from '../controller/AnaliticaController.js';
import { ReporteController } from '../controller/ReporteController.js';
import { crearAnaliticaRouter } from '../route/analitica.routes.js';
import { crearReporteRouter } from '../route/reporte.routes.js';
import { AnaliticaServiceImpl } from '../service/impl/AnaliticaServiceImpl.js';
import { KarmaServiceImpl } from '../service/impl/KarmaServiceImpl.js';
import { ReporteServiceImpl } from '../service/impl/ReporteServiceImpl.js';
import { SaturacionServiceImpl } from '../service/impl/SaturacionServiceImpl.js';
import type { KarmaService } from '../service/KarmaService.js';
import type { ReporteService } from '../service/ReporteService.js';
import type { SaturacionService } from '../service/SaturacionService.js';
import type { Logger } from '../util/logger.js';
import type { Reloj } from '../util/Reloj.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';

/** Strategy variant named by SATURACION_ESTRATEGIA, with the window and thresholds of the configuration. */
export function elegirEstrategiaSaturacion(cfg: ConfiguracionApp): EstrategiaSaturacion {
  const reglas = cfg.reglas;
  if (reglas.saturacionEstrategia === 'ULTIMO_REPORTE') {
    return new SaturacionUltimoReporteStrategy({ ventanaMin: reglas.saturacionVentanaMin });
  }
  return new SaturacionPonderadaStrategy({
    ventanaMin: reglas.saturacionVentanaMin,
    minReportes: reglas.saturacionMinReportes,
    umbralModerado: reglas.saturacionUmbralModerado,
    umbralSaturado: reglas.saturacionUmbralSaturado,
  });
}

export interface DependenciasServiciosReporte {
  cfg: ConfiguracionApp;
  reloj: Reloj;
  logger: Logger;
  conexion: ConexionBD;
  usuarioDAO: UsuarioDAO;
  /** The Sequelize one belongs to M2; tests pass the in-memory one. */
  lugarDAO: LugarDAO;
  reporteDAO: ReporteDAO;
  /** Shared with the other streams that publish or subscribe (built once by the composition root). */
  subject: SaturacionSubject;
}

export interface ServiciosReporte {
  reporteFacade: ReporteFacade;
  reporteService: ReporteService;
  /** M5 and M6 receive these two from here. */
  karmaService: KarmaService;
  saturacionService: SaturacionService;
}

/** Wires the report services and facade from the configuration; a pure function so tests can feed it in-memory DAOs. */
export function construirServiciosReporte(deps: DependenciasServiciosReporte): ServiciosReporte {
  const { cfg, reloj, logger, conexion, usuarioDAO, lugarDAO, reporteDAO, subject } = deps;
  const reglas = cfg.reglas;
  const reporteService = new ReporteServiceImpl({ reporteDAO, lugarDAO, reloj, cooldownMin: reglas.cooldownReporteMin });
  const karmaService = new KarmaServiceImpl({
    usuarioDAO,
    reporteDAO,
    reloj,
    karmaPorReporte: reglas.karmaPorReporte,
    karmaPorValidacion: reglas.karmaPorValidacion,
    reportesPremiadosPorDia: reglas.karmaReportesPremiadosDia,
    zonaHoraria: cfg.servidor.zonaHoraria,
  });
  const saturacionService = new SaturacionServiceImpl({
    lugarDAO,
    reporteDAO,
    estrategia: elegirEstrategiaSaturacion(cfg),
    reloj,
    ventanaMin: reglas.saturacionVentanaMin,
  });
  const reporteFacade = new ReporteFacadeImpl({
    lugarDAO,
    reporteService,
    karmaService,
    saturacionService,
    subject,
    conexion,
    logger,
  });
  return { reporteFacade, reporteService, karmaService, saturacionService };
}

/**
 * Reports and analytics stream (M4). Must be mounted before the validation stream so /reportes/mios is never
 * captured by /reportes/:id. The DAOs and the shared subject come from the composition root.
 */
export function construirReporte({
  cfg,
  logger,
  conexion,
  reloj,
  usuarioDAO,
  lugarDAO,
  reporteDAO,
  subject,
  guardas,
}: Infraestructura): MontajeRuta[] {
  const { reporteFacade, reporteService } = construirServiciosReporte({
    cfg,
    reloj,
    logger,
    conexion,
    usuarioDAO,
    lugarDAO,
    reporteDAO,
    subject,
  });
  const { reglas } = cfg;
  const analiticaService = new AnaliticaServiceImpl({
    lugarDAO,
    reporteDAO,
    reloj,
    zonaHoraria: cfg.servidor.zonaHoraria,
    minMuestras: reglas.analiticaMinMuestras,
  });
  return [
    { modulo: 'reporte', ruta: '/api', router: crearReporteRouter(new ReporteController(reporteFacade, reporteService), guardas) },
    { modulo: 'analitica', ruta: '/api', router: crearAnaliticaRouter(new AnaliticaController(analiticaService), guardas) },
  ];
}
