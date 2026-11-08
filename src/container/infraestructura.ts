import type { RequestHandler } from 'express';
import type { EmisorToken } from '../adapter/seguridad/EmisorToken.js';
import type { Hasher } from '../adapter/seguridad/Hasher.js';
import type { ConfiguracionApp } from '../config/ConfiguracionApp.js';
import type { LugarDAO } from '../dao/LugarDAO.js';
import { PuntajeDAOSequelize } from '../dao/impl/sequelize/PuntajeDAOSequelize.js';
import { SancionDAOSequelize } from '../dao/impl/sequelize/SancionDAOSequelize.js';
import type { PuntajeDAO } from '../dao/PuntajeDAO.js';
import type { ReporteDAO } from '../dao/ReporteDAO.js';
import type { SancionDAO } from '../dao/SancionDAO.js';
import type { UsuarioDAO } from '../dao/UsuarioDAO.js';
import type { ConexionBD } from '../datasource/ConexionBD.js';
import { Rol } from '../enum/Rol.js';
import { crearAutenticar } from '../middleware/autenticar.js';
import { requerirRol } from '../middleware/requerirRol.js';
import { PublicadorSaturacion } from '../pattern/observer/PublicadorSaturacion.js';
import type { ReglaEstadoValidacion } from '../pattern/strategy/confiabilidad/derivarEstadoValidacion.js';
import type { SaturacionSubject } from '../pattern/observer/SaturacionSubject.js';
import type { MiddlewareRuta } from '../route/middlewareRuta.js';
import { crearSistemaRouter } from '../route/sistema.routes.js';
import { PuntajeServiceImpl } from '../service/impl/PuntajeServiceImpl.js';
import { VerificadorEstadoCuentaImpl } from '../service/impl/VerificadorEstadoCuentaImpl.js';
import type { PuntajeService } from '../service/PuntajeService.js';
import type { VerificadorEstadoCuenta } from '../service/VerificadorEstadoCuenta.js';
import { EstadoServicio } from '../util/EstadoServicio.js';
import type { Logger } from '../util/logger.js';
import { relojSistema, type Reloj } from '../util/Reloj.js';
import type { MontajeRuta } from './Contenedor.js';
import type { DependenciasLugar } from './lugar.js';
import type { DependenciasSeguridad } from './seguridad.js';

/** Ports every stream builder may use. Streams add their own DAOs in their builder, never here. */
export interface DependenciasInfraestructura {
  cfg: ConfiguracionApp;
  logger: Logger;
  conexion: ConexionBD;
  usuarioDAO: UsuarioDAO;
  /** Built by the composition root: Sequelize in production, in memory in tests. */
  lugarDAO: LugarDAO;
  reporteDAO: ReporteDAO;
  /** Sanctions read by the account-status check and written by M6; Sequelize when omitted (tests hand in the in-memory one). */
  sancionDAO?: SancionDAO;
  /** Points read model (reports and votes); Sequelize when omitted (tests hand in the in-memory one). */
  puntajeDAO?: PuntajeDAO;
  hasher: Hasher;
  emisorToken: EmisorToken;
  /** Places-stream ports to replace (tests); omitted ones are built by `container/lugar.ts`. */
  lugar?: Partial<DependenciasLugar>;
  /** Recovery-stream ports to replace (tests); omitted ones are built by `container/seguridad.ts`. */
  seguridad?: Partial<DependenciasSeguridad>;
  /** Readiness flag shared with the shutdown; a fresh one when omitted (tests). */
  estado?: EstadoServicio;
  /** The system clock when omitted; tests pin it. */
  reloj?: Reloj;
  /** Saturation-change subject shared by publishers (M4, M6) and subscribers (M3); a new publisher when omitted. */
  subject?: SaturacionSubject;
}

export interface Infraestructura extends Omit<DependenciasInfraestructura, 'estado' | 'reloj' | 'subject' | 'sancionDAO' | 'puntajeDAO'> {
  sancionDAO: SancionDAO;
  /** Points and tier of users (CRO-72): read by the account, admin and report streams. */
  puntajeService: PuntajeService;
  estado: EstadoServicio;
  reloj: Reloj;
  /** The one subject of level changes: M4 and M6 publish through it, M3 subscribes. */
  subject: SaturacionSubject;
  verificador: VerificadorEstadoCuenta;
  autenticar: RequestHandler;
  /** Route guards handed to routers (auth chain, admin chain). */
  guardas: MiddlewareRuta;
}

/**
 * The validation-state rule of the configuration (CONFIABILIDAD_MIN_VOTOS, CONFIABILIDAD_UMBRAL_ALTA,
 * CONFIABILIDAD_UMBRAL_MEDIA, CONFIABILIDAD_MIN_VOTOS_ESTADO). The only place that reads those keys: the reliability
 * strategy, ValidacionServiceImpl and the points query all take it from here, so they cannot drift apart.
 */
export function reglaEstadoValidacion(cfg: ConfiguracionApp): ReglaEstadoValidacion {
  const { confiabilidadMinVotos, confiabilidadUmbralAlta, confiabilidadUmbralMedia, confiabilidadMinVotosEstado } = cfg.reglas;
  return {
    minVotos: confiabilidadMinVotos,
    umbralAlta: confiabilidadUmbralAlta,
    umbralMedia: confiabilidadUmbralMedia,
    minVotosEstado: confiabilidadMinVotosEstado,
  };
}

/** Shared pieces built once: clock, account-status check, points, `autenticar` and the role guard. */
export function construirInfraestructura(dependencias: DependenciasInfraestructura): Infraestructura {
  const reloj = dependencias.reloj ?? relojSistema;
  const sancionDAO = dependencias.sancionDAO ?? new SancionDAOSequelize();
  const { puntajeDAO = new PuntajeDAOSequelize(), ...resto } = dependencias;
  const puntajeService = new PuntajeServiceImpl({ puntajeDAO, regla: reglaEstadoValidacion(dependencias.cfg) });
  const verificador = new VerificadorEstadoCuentaImpl({ usuarioDAO: dependencias.usuarioDAO, sancionDAO, reloj });
  const autenticar = crearAutenticar({
    emisorToken: dependencias.emisorToken,
    usuarioDAO: dependencias.usuarioDAO,
    verificador,
  });
  return {
    ...resto,
    estado: dependencias.estado ?? new EstadoServicio(),
    reloj,
    sancionDAO,
    puntajeService,
    subject: dependencias.subject ?? new PublicadorSaturacion(dependencias.logger),
    verificador,
    autenticar,
    guardas: { autenticar, requerirAdmin: requerirRol(Rol.ADMIN) },
  };
}

/** `GET /` and `GET /api/salud`: mounted first, public. */
export function construirSistema({ conexion, estado }: Infraestructura): MontajeRuta[] {
  return [{ modulo: 'sistema', ruta: '/', router: crearSistemaRouter(conexion, estado) }];
}
