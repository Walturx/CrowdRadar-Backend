import type { EmisorToken } from '../adapter/seguridad/EmisorToken.js';
import type { Hasher } from '../adapter/seguridad/Hasher.js';
import { BcryptHasher } from '../adapter/seguridad/impl/BcryptHasher.js';
import { JwtEmisorToken } from '../adapter/seguridad/impl/JwtEmisorToken.js';
import type { ConfiguracionApp } from '../config/ConfiguracionApp.js';
import { AuthController } from '../controller/AuthController.js';
import { UsuarioController } from '../controller/UsuarioController.js';
import { UsuarioDAOSequelize } from '../dao/impl/sequelize/UsuarioDAOSequelize.js';
import type { UsuarioDAO } from '../dao/UsuarioDAO.js';
import type { ConexionBD } from '../datasource/ConexionBD.js';
import { ConexionPostgresFactory } from '../datasource/impl/ConexionPostgresFactory.js';
import { crearAutenticar } from '../middleware/autenticar.js';
import { limitarIntentos } from '../middleware/limitarIntentos.js';
import { crearAuthRouter } from '../route/auth.routes.js';
import { crearUsuarioRouter } from '../route/usuario.routes.js';
import { AuthServiceImpl } from '../service/impl/AuthServiceImpl.js';
import { UsuarioServiceImpl } from '../service/impl/UsuarioServiceImpl.js';
import { VerificadorEstadoCuentaImpl } from '../service/impl/VerificadorEstadoCuentaImpl.js';
import type { Logger } from '../util/logger.js';
import type { Contenedor } from './Contenedor.js';

export interface DependenciasEnsamblado {
  cfg: ConfiguracionApp;
  logger: Logger;
  conexion: ConexionBD;
  usuarioDAO: UsuarioDAO;
  hasher: Hasher;
  emisorToken: EmisorToken;
}

/**
 * Pattern: composition root (manual DI). Wires services, controllers and routers from
 * already-built ports; production and tests share it, only the ports differ.
 */
export function ensamblar({ cfg, logger, conexion, usuarioDAO, hasher, emisorToken }: DependenciasEnsamblado): Contenedor {
  const verificador = new VerificadorEstadoCuentaImpl();
  const autenticar = crearAutenticar({ emisorToken, usuarioDAO, verificador });

  const { limites, politicaMensajesAuth } = cfg.seguridad;
  const ventanaMs = limites.ventanaMin * 60_000;

  const authController = new AuthController(
    new AuthServiceImpl({ usuarioDAO, hasher, emisorToken, verificador, politicaMensajes: politicaMensajesAuth }),
  );
  const usuarioController = new UsuarioController(new UsuarioServiceImpl({ usuarioDAO, hasher }));

  return {
    conexion,
    logger,
    rutas: [
      {
        ruta: '/api/auth',
        router: crearAuthRouter({
          controller: authController,
          limitarRegistro: limitarIntentos({ max: limites.registro, ventanaMs }),
          limitarLogin: limitarIntentos({ max: limites.login, ventanaMs, soloFallidos: true }),
        }),
      },
      {
        ruta: '/api/users',
        router: crearUsuarioRouter({
          controller: usuarioController,
          autenticar,
          limitarPassword: limitarIntentos({ max: limites.password, ventanaMs, soloFallidos: true }),
        }),
      },
    ],
  };
}

/** Production composition: connects to PostgreSQL (fails fast when unreachable) and wires the real adapters. */
export async function crearContenedor(cfg: ConfiguracionApp, logger: Logger): Promise<Contenedor> {
  const conexion = await new ConexionPostgresFactory(cfg.bd, logger).conectar();
  return ensamblar({
    cfg,
    logger,
    conexion,
    usuarioDAO: new UsuarioDAOSequelize(),
    hasher: new BcryptHasher(cfg.seguridad.bcryptCosto),
    emisorToken: new JwtEmisorToken(cfg.seguridad),
  });
}
