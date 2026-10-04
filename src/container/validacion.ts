import type { ConfiguracionApp } from '../config/ConfiguracionApp.js';
import { DenunciaController } from '../controller/DenunciaController.js';
import { ValidacionController } from '../controller/ValidacionController.js';
import type { DenunciaDAO } from '../dao/DenunciaDAO.js';
import { DenunciaDAOSequelize } from '../dao/impl/sequelize/DenunciaDAOSequelize.js';
import { ValidacionDAOSequelize } from '../dao/impl/sequelize/ValidacionDAOSequelize.js';
import type { ValidacionDAO } from '../dao/ValidacionDAO.js';
import type { EstrategiaConfiabilidad } from '../pattern/strategy/confiabilidad/EstrategiaConfiabilidad.js';
import { ConfiabilidadPonderadaKarmaStrategy } from '../pattern/strategy/confiabilidad/impl/ConfiabilidadPonderadaKarmaStrategy.js';
import { ConfiabilidadSimpleStrategy } from '../pattern/strategy/confiabilidad/impl/ConfiabilidadSimpleStrategy.js';
import { crearValidacionRouter } from '../route/validacion.routes.js';
import { DenunciaServiceImpl } from '../service/impl/DenunciaServiceImpl.js';
import { ValidacionServiceImpl } from '../service/impl/ValidacionServiceImpl.js';
import type { DenunciaService } from '../service/DenunciaService.js';
import type { ValidacionService } from '../service/ValidacionService.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';
import { construirServiciosReporte } from './reporte.js';

/** DAOs of the validation stream; tests hand in the in-memory ones, production builds the Sequelize ones. */
export interface DaosValidacion {
  validacionDAO: ValidacionDAO;
  denunciaDAO: DenunciaDAO;
}

export function crearDaosValidacionSequelize(): DaosValidacion {
  return { validacionDAO: new ValidacionDAOSequelize(), denunciaDAO: new DenunciaDAOSequelize() };
}

/** Strategy variant named by CONFIABILIDAD_ESTRATEGIA, with the thresholds of the configuration. */
export function elegirEstrategiaConfiabilidad(cfg: ConfiguracionApp): EstrategiaConfiabilidad {
  const { confiabilidadEstrategia, confiabilidadMinVotos, confiabilidadUmbralAlta, confiabilidadUmbralMedia, topeKarmaPeso } =
    cfg.reglas;
  const umbrales = { minVotos: confiabilidadMinVotos, umbralAlta: confiabilidadUmbralAlta, umbralMedia: confiabilidadUmbralMedia };
  if (confiabilidadEstrategia === 'SIMPLE') return new ConfiabilidadSimpleStrategy(umbrales);
  return new ConfiabilidadPonderadaKarmaStrategy({ ...umbrales, topeKarmaPeso });
}

export interface ServiciosValidacion {
  validacionService: ValidacionService;
  denunciaService: DenunciaService;
}

/** Wires the validation and complaint services; the karma service is the same one the report stream builds. */
export function construirServiciosValidacion(infra: Infraestructura, daos: DaosValidacion): ServiciosValidacion {
  const { cfg, reloj, logger, conexion, usuarioDAO, lugarDAO, reporteDAO, subject } = infra;
  const { karmaService } = construirServiciosReporte({ cfg, reloj, logger, conexion, usuarioDAO, lugarDAO, reporteDAO, subject });
  const { reglas } = cfg;
  return {
    validacionService: new ValidacionServiceImpl({
      ...daos,
      reporteDAO,
      lugarDAO,
      usuarioDAO,
      karmaService,
      estrategia: elegirEstrategiaConfiabilidad(cfg),
      conexion,
      reloj,
      minVotosEstado: reglas.confiabilidadMinVotosEstado,
      karmaPorValidacion: reglas.karmaPorValidacion,
      limiteLugares: cfg.lugares.limiteMax,
    }),
    denunciaService: new DenunciaServiceImpl({ reporteDAO, denunciaDAO: daos.denunciaDAO, reloj }),
  };
}

/** Validation and reporting-abuse stream (M5). Mounted after the reports stream. */
export function construirValidacion(infra: Infraestructura, daos: DaosValidacion): MontajeRuta[] {
  const { validacionService, denunciaService } = construirServiciosValidacion(infra, daos);
  const { radioPendientesKm, ventanaPendientesHoras } = infra.cfg.reglas;
  const router = crearValidacionRouter(
    infra.guardas,
    new ValidacionController(validacionService),
    new DenunciaController(denunciaService),
    { radioKm: radioPendientesKm, horas: ventanaPendientesHoras },
  );
  return [{ modulo: 'validacion', ruta: '/api', router }];
}
