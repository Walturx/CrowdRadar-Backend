import { AuthController } from '../controller/AuthController.js';
import { UsuarioController } from '../controller/UsuarioController.js';
import { limitarIntentos } from '../middleware/limitarIntentos.js';
import { crearAuthRouter } from '../route/auth.routes.js';
import { crearRecuperacionRouter } from '../route/recuperacion.routes.js';
import { crearUsuarioRouter } from '../route/usuario.routes.js';
import { AuthServiceImpl } from '../service/impl/AuthServiceImpl.js';
import { UsuarioServiceImpl } from '../service/impl/UsuarioServiceImpl.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';

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
