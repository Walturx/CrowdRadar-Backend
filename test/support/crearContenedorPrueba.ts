import type { EmisorToken } from '../../src/adapter/seguridad/EmisorToken.js';
import type { Hasher } from '../../src/adapter/seguridad/Hasher.js';
import { BcryptHasher } from '../../src/adapter/seguridad/impl/BcryptHasher.js';
import { JwtEmisorToken } from '../../src/adapter/seguridad/impl/JwtEmisorToken.js';
import type { ConfiguracionApp } from '../../src/config/ConfiguracionApp.js';
import type { Contenedor } from '../../src/container/Contenedor.js';
import { ensamblar } from '../../src/container/index.js';
import type { Logger } from '../../src/util/logger.js';
import { ConexionFalsa } from './ConexionFalsa.js';
import { crearLoggerSilencioso } from './LoggerSilencioso.js';
import { UsuarioDAOMemoria } from './dao/memoria/UsuarioDAOMemoria.js';
import { configPrueba, type SobrescritosEntorno } from './configPrueba.js';

export interface OpcionesContenedorPrueba {
  /** Env-style configuration overrides (e.g. `{ POLITICA_MENSAJES_AUTH: 'DETALLADA' }`). */
  cfg?: SobrescritosEntorno;
  usuarioDAO?: UsuarioDAOMemoria;
  hasher?: Hasher;
  emisorToken?: EmisorToken;
  conexion?: ConexionFalsa;
  logger?: Logger;
}

export interface ContenedorPrueba {
  contenedor: Contenedor;
  cfg: ConfiguracionApp;
  usuarioDAO: UsuarioDAOMemoria;
  hasher: Hasher;
  emisorToken: EmisorToken;
  conexion: ConexionFalsa;
}

/**
 * Same composition root as production (`ensamblar`) fed with in-memory DAOs and fakes:
 * no database, no network. Real bcrypt (cost 4) and real JWT keep the auth flow honest.
 */
export function crearContenedorPrueba(opciones: OpcionesContenedorPrueba = {}): ContenedorPrueba {
  const cfg = configPrueba(opciones.cfg);
  const usuarioDAO = opciones.usuarioDAO ?? new UsuarioDAOMemoria();
  const hasher = opciones.hasher ?? new BcryptHasher(cfg.seguridad.bcryptCosto);
  const emisorToken = opciones.emisorToken ?? new JwtEmisorToken(cfg.seguridad);
  const conexion = opciones.conexion ?? new ConexionFalsa();
  const contenedor = ensamblar({
    cfg,
    logger: opciones.logger ?? crearLoggerSilencioso(),
    conexion,
    usuarioDAO,
    hasher,
    emisorToken,
  });
  return { contenedor, cfg, usuarioDAO, hasher, emisorToken, conexion };
}
