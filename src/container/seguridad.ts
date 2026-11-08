import type { EnviadorCorreo } from '../adapter/correo/EnviadorCorreo.js';
import { ConsolaCorreoAdapter } from '../adapter/correo/impl/ConsolaCorreoAdapter.js';
import { NodemailerCorreoAdapter } from '../adapter/correo/impl/NodemailerCorreoAdapter.js';
import type { GeneradorToken } from '../adapter/seguridad/GeneradorToken.js';
import { CryptoGeneradorTokenAdapter } from '../adapter/seguridad/impl/CryptoGeneradorTokenAdapter.js';
import type { ConfiguracionApp } from '../config/ConfiguracionApp.js';
import { AuthController } from '../controller/AuthController.js';
import { RecuperacionController } from '../controller/RecuperacionController.js';
import { UsuarioController } from '../controller/UsuarioController.js';
import type { DispositivoDAO } from '../dao/DispositivoDAO.js';
import { DispositivoDAOSequelize } from '../dao/impl/sequelize/DispositivoDAOSequelize.js';
import type { TokenRecuperacionDAO } from '../dao/TokenRecuperacionDAO.js';
import { TokenRecuperacionDAOSequelize } from '../dao/impl/sequelize/TokenRecuperacionDAOSequelize.js';
import { RecuperacionFacadeImpl } from '../facade/impl/RecuperacionFacadeImpl.js';
import type { RecuperacionFacade } from '../facade/RecuperacionFacade.js';
import type { Logger } from '../util/logger.js';
import { cargarVistaRestablecer } from '../view/VistaRestablecer.js';
import { limitarIntentos } from '../middleware/limitarIntentos.js';
import { crearAuthRouter } from '../route/auth.routes.js';
import { crearRecuperacionRouter } from '../route/recuperacion.routes.js';
import { crearUsuarioRouter } from '../route/usuario.routes.js';
import { AuthServiceImpl } from '../service/impl/AuthServiceImpl.js';
import { UsuarioServiceImpl } from '../service/impl/UsuarioServiceImpl.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';

/** Ports of the password recovery stream (M1); tests replace any of them (`infra.seguridad`). */
export interface DependenciasSeguridad {
  tokenDAO: TokenRecuperacionDAO;
  /** Devices of the user (M3's DAO), deleted when the password changes. */
  dispositivoDAO: DispositivoDAO;
  generador: GeneradorToken;
  correo: EnviadorCorreo;
}

/**
 * Mail provider named by CORREO_PROVEEDOR: the console adapter by default, Nodemailer over SMTP with `smtp`.
 * Production refuses the console at assembly: a silent fallback would "send" recovery links to the logs in an
 * environment that expects real mail.
 */
export function crearEnviadorCorreo(cfg: ConfiguracionApp, logger: Logger): EnviadorCorreo {
  const { proveedor, mostrarEnlaceDev, smtp, remitente } = cfg.correo;
  if (proveedor === 'smtp') return NodemailerCorreoAdapter.desdeSmtp(smtp, remitente);
  if (cfg.servidor.entorno === 'production') {
    throw new Error('CORREO_PROVEEDOR=consola no se admite con NODE_ENV=production: los enlaces de recuperación no llegarían a nadie. Configura CORREO_PROVEEDOR=smtp.');
  }
  return new ConsolaCorreoAdapter(logger, { mostrarEnlace: mostrarEnlaceDev });
}

/** RecuperacionFacade over the injected ports and, for the rest, the production ones (Sequelize DAO, crypto generator, mail provider). */
export function crearRecuperacionFacade({ cfg, logger, conexion, reloj, usuarioDAO, hasher, seguridad = {} }: Infraestructura): RecuperacionFacade {
  return new RecuperacionFacadeImpl({
    usuarioDAO,
    hasher,
    conexion,
    reloj,
    logger,
    tokenDAO: seguridad.tokenDAO ?? new TokenRecuperacionDAOSequelize(),
    dispositivoDAO: seguridad.dispositivoDAO ?? new DispositivoDAOSequelize(),
    generador: seguridad.generador ?? new CryptoGeneradorTokenAdapter(),
    correo: seguridad.correo ?? crearEnviadorCorreo(cfg, logger),
    expiraMin: cfg.reglas.recuperacionExpiraMin,
    urlPublica: cfg.servidor.urlPublica,
    politicaMensajes: cfg.seguridad.politicaMensajesAuth,
  });
}

/** Recovery mails one address can be sent per hour, whatever the IP (an inbox flood is not stopped by the per-IP limit). */
const RECUPERAR_POR_EMAIL = 3;
const UNA_HORA_MS = 60 * 60_000;

/**
 * Account stream: register/login, own profile and password, and the password recovery endpoints (M1).
 * Rate limits come from configuration. Register, login and password change count every attempt per IP;
 * login also locks an email after LIMITE_LOGIN failed attempts (any IP) for the rest of the window.
 */
export function construirSeguridad(infra: Infraestructura): MontajeRuta[] {
  const { cfg, usuarioDAO, hasher, emisorToken, verificador, autenticar, puntajeService } = infra;
  const { limites, politicaMensajesAuth } = cfg.seguridad;
  const { ventanaMs } = limites;

  const authController = new AuthController(
    new AuthServiceImpl({ usuarioDAO, hasher, emisorToken, verificador, puntajeService, politicaMensajes: politicaMensajesAuth }),
  );
  const usuarioController = new UsuarioController(
    new UsuarioServiceImpl({ usuarioDAO, hasher, puntajeService, dispositivoDAO: infra.seguridad?.dispositivoDAO ?? new DispositivoDAOSequelize() }),
  );

  // The paths /api/auth and /api/users are frozen by the Sprint 1 frontend contract (the app already calls them);
  // every other resource uses Spanish paths. Do not "fix" the inconsistency without a coordinated frontend change.
  return [
    {
      modulo: 'auth',
      ruta: '/api/auth',
      router: crearAuthRouter({
        controller: authController,
        limitarRegistro: limitarIntentos({ max: limites.registro, ventanaMs }),
        limitarLogin: limitarIntentos({ max: limites.login, ventanaMs }),
        limitarBloqueoLogin: limitarIntentos({ max: limites.login, ventanaMs, clave: 'email', soloFallidos: true, bloqueo: true }),
      }),
    },
    {
      modulo: 'usuario',
      ruta: '/api/users',
      router: crearUsuarioRouter({
        controller: usuarioController,
        autenticar,
        limitarPassword: limitarIntentos({ max: limites.password, ventanaMs }),
      }),
    },
    {
      modulo: 'recuperacion',
      ruta: '/',
      router: crearRecuperacionRouter({
        controller: new RecuperacionController(crearRecuperacionFacade(infra), cargarVistaRestablecer()),
        limitarRecuperar: limitarIntentos({ max: limites.recuperar, ventanaMs }),
        limitarRecuperarPorEmail: limitarIntentos({ max: RECUPERAR_POR_EMAIL, ventanaMs: UNA_HORA_MS, clave: 'email' }),
        limitarRestablecer: limitarIntentos({ max: limites.restablecer, ventanaMs }),
        limitarPagina: limitarIntentos({ max: limites.restablecer, ventanaMs }),
      }),
    },
  ];
}
