import type { EnviadorCorreo } from '../adapter/correo/EnviadorCorreo.js';
import { ConsolaCorreoAdapter } from '../adapter/correo/impl/ConsolaCorreoAdapter.js';
import type { GeneradorToken } from '../adapter/seguridad/GeneradorToken.js';
import { CryptoGeneradorTokenAdapter } from '../adapter/seguridad/impl/CryptoGeneradorTokenAdapter.js';
import type { ConfiguracionApp } from '../config/ConfiguracionApp.js';
import { AuthController } from '../controller/AuthController.js';
import { UsuarioController } from '../controller/UsuarioController.js';
import type { TokenRecuperacionDAO } from '../dao/TokenRecuperacionDAO.js';
import { TokenRecuperacionDAOSequelize } from '../dao/impl/sequelize/TokenRecuperacionDAOSequelize.js';
import { RecuperacionFacadeImpl } from '../facade/impl/RecuperacionFacadeImpl.js';
import type { RecuperacionFacade } from '../facade/RecuperacionFacade.js';
import type { Logger } from '../util/logger.js';
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
  generador: GeneradorToken;
  correo: EnviadorCorreo;
}

/**
 * Mail provider named by CORREO_PROVEEDOR: the console adapter by default. `smtp` is configuration-valid but its
 * adapter (Nodemailer, optional slice BE-05) is not delivered yet: failing at assembly is better than a silent
 * fallback that would "send" recovery links to the console in an environment that expects real mail.
 */
export function crearEnviadorCorreo({ proveedor }: ConfiguracionApp['correo'], logger: Logger): EnviadorCorreo {
  if (proveedor === 'smtp') throw new Error('CORREO_PROVEEDOR=smtp no está disponible todavía: falta NodemailerCorreoAdapter. Usa CORREO_PROVEEDOR=consola.');
  return new ConsolaCorreoAdapter(logger);
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
    generador: seguridad.generador ?? new CryptoGeneradorTokenAdapter(),
    correo: seguridad.correo ?? crearEnviadorCorreo(cfg.correo, logger),
    expiraMin: cfg.reglas.recuperacionExpiraMin,
    urlPublica: cfg.servidor.urlPublica,
    politicaMensajes: cfg.seguridad.politicaMensajesAuth,
  });
}

/**
 * Account stream: register/login, own profile and password, and the password recovery stubs (M1).
 * Rate limits come from configuration. Register, login and password change count every attempt per IP;
 * login also locks an email after LIMITE_LOGIN failed attempts (any IP) for the rest of the window.
 */
export function construirSeguridad({ cfg, usuarioDAO, hasher, emisorToken, verificador, autenticar }: Infraestructura): MontajeRuta[] {
  const { limites, politicaMensajesAuth } = cfg.seguridad;
  const { ventanaMs } = limites;

  const authController = new AuthController(
    new AuthServiceImpl({ usuarioDAO, hasher, emisorToken, verificador, politicaMensajes: politicaMensajesAuth }),
  );
  const usuarioController = new UsuarioController(new UsuarioServiceImpl({ usuarioDAO, hasher }));

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
    { modulo: 'recuperacion', ruta: '/', router: crearRecuperacionRouter() },
  ];
}
