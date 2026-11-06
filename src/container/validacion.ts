import type { ConfiguracionApp } from '../config/ConfiguracionApp.js';
import { DenunciaController } from '../controller/DenunciaController.js';
import { ValidacionController } from '../controller/ValidacionController.js';
import type { DenunciaDAO } from '../dao/DenunciaDAO.js';
import { DenunciaDAOSequelize } from '../dao/impl/sequelize/DenunciaDAOSequelize.js';
import { ValidacionDAOSequelize } from '../dao/impl/sequelize/ValidacionDAOSequelize.js';
import type { ValidacionDAO } from '../dao/ValidacionDAO.js';
import type { EstrategiaConfiabilidad } from '../pattern/strategy/confiabilidad/EstrategiaConfiabilidad.js';
import { ConfiabilidadSimpleStrategy } from '../pattern/strategy/confiabilidad/impl/ConfiabilidadSimpleStrategy.js';
import { limitarIntentos } from '../middleware/limitarIntentos.js';
import { crearValidacionRouter } from '../route/validacion.routes.js';
import { DenunciaServiceImpl } from '../service/impl/DenunciaServiceImpl.js';
import { ValidacionServiceImpl } from '../service/impl/ValidacionServiceImpl.js';
import type { DenunciaService } from '../service/DenunciaService.js';
import type { ValidacionService } from '../service/ValidacionService.js';
import { MS_POR_HORA } from '../util/tiempo.js';
import type { MontajeRuta } from './Contenedor.js';
import { reglaEstadoValidacion, type Infraestructura } from './infraestructura.js';

/** DAOs of the validation stream; tests hand in the in-memory ones, production builds the Sequelize ones. */
export interface DaosValidacion {
  validacionDAO: ValidacionDAO;
  denunciaDAO: DenunciaDAO;
}

export function crearDaosValidacionSequelize(): DaosValidacion {
  return { validacionDAO: new ValidacionDAOSequelize(), denunciaDAO: new DenunciaDAOSequelize() };
}

/** The reliability strategy (every vote weighs 1) with the thresholds of the configuration (`reglaEstadoValidacion`). */
export function crearEstrategiaConfiabilidad(cfg: ConfiguracionApp): EstrategiaConfiabilidad {
  return new ConfiabilidadSimpleStrategy(reglaEstadoValidacion(cfg));
}

export interface ServiciosValidacion {
  validacionService: ValidacionService;
  denunciaService: DenunciaService;
}

/** Wires the validation and complaint services. A vote awards nothing: points are computed when read (CRO-72). */
export function construirServiciosValidacion(infra: Infraestructura, daos: DaosValidacion): ServiciosValidacion {
  const { cfg, reloj, conexion, usuarioDAO, lugarDAO, reporteDAO } = infra;
  return {
    validacionService: new ValidacionServiceImpl({
      ...daos,
      reporteDAO,
      lugarDAO,
      usuarioDAO,
      estrategia: crearEstrategiaConfiabilidad(cfg),
      conexion,
      reloj,
      minVotosEstado: reglaEstadoValidacion(cfg).minVotosEstado,
      limiteLugares: cfg.lugares.limiteMax,
    }),
    denunciaService: new DenunciaServiceImpl({ reporteDAO, denunciaDAO: daos.denunciaDAO, reloj }),
  };
}

/** Validation and reporting-abuse stream (M5). Mounted after the reports stream. */
export function construirValidacion(infra: Infraestructura, daos: DaosValidacion): MontajeRuta[] {
  const { validacionService, denunciaService } = construirServiciosValidacion(infra, daos);
  const { radioPendientesKm, ventanaPendientesHoras } = infra.cfg.reglas;
  const { limites } = infra.cfg.seguridad;
  const router = crearValidacionRouter(
    infra.guardas,
    new ValidacionController(validacionService),
    new DenunciaController(denunciaService),
    { radioKm: radioPendientesKm, horas: ventanaPendientesHoras },
    {
      limitarValidaciones: limitarIntentos({ max: limites.validaciones, ventanaMs: MS_POR_HORA, clave: 'usuario' }),
      limitarDenuncias: limitarIntentos({ max: limites.denuncias, ventanaMs: MS_POR_HORA, clave: 'usuario' }),
    },
  );
  return [{ modulo: 'validacion', ruta: '/api', router }];
}
