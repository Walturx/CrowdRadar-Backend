import type { EmisorToken } from '../../src/adapter/seguridad/EmisorToken.js';
import type { Hasher } from '../../src/adapter/seguridad/Hasher.js';
import { BcryptHasherAdapter } from '../../src/adapter/seguridad/impl/BcryptHasherAdapter.js';
import { JwtEmisorTokenAdapter } from '../../src/adapter/seguridad/impl/JwtEmisorTokenAdapter.js';
import type { ConfiguracionApp } from '../../src/config/ConfiguracionApp.js';
import type { Contenedor } from '../../src/container/Contenedor.js';
import { ensamblar } from '../../src/container/index.js';
import type { EstadoServicio } from '../../src/util/EstadoServicio.js';
import type { Logger } from '../../src/util/logger.js';
import { ConexionFalsa } from './ConexionFalsa.js';
import { crearLoggerSilencioso } from './LoggerSilencioso.js';
import { LugarDAOMemoria } from './dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from './dao/memoria/ReporteDAOMemoria.js';
import { UsuarioDAOMemoria } from './dao/memoria/UsuarioDAOMemoria.js';
import { configPrueba, type SobrescritosEntorno } from './configPrueba.js';

export interface OpcionesContenedorPrueba {
  /** Env-style configuration overrides (e.g. `{ POLITICA_MENSAJES_AUTH: 'DETALLADA' }`). */
  cfg?: SobrescritosEntorno;
  usuarioDAO?: UsuarioDAOMemoria;
  lugarDAO?: LugarDAOMemoria;
  reporteDAO?: ReporteDAOMemoria;
  hasher?: Hasher;
  emisorToken?: EmisorToken;
  conexion?: ConexionFalsa;
  logger?: Logger;
  estado?: EstadoServicio;
}

export interface ContenedorPrueba {
  contenedor: Contenedor;
  cfg: ConfiguracionApp;
  usuarioDAO: UsuarioDAOMemoria;
  lugarDAO: LugarDAOMemoria;
  reporteDAO: ReporteDAOMemoria;
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
  const lugarDAO = opciones.lugarDAO ?? new LugarDAOMemoria();
  const reporteDAO = opciones.reporteDAO ?? new ReporteDAOMemoria();
  const hasher = opciones.hasher ?? new BcryptHasherAdapter(cfg.seguridad.bcryptCosto);
  const emisorToken = opciones.emisorToken ?? new JwtEmisorTokenAdapter(cfg.seguridad);
  const conexion = opciones.conexion ?? new ConexionFalsa();
  const contenedor = ensamblar({
    cfg,
    logger: opciones.logger ?? crearLoggerSilencioso(),
    conexion,
    estado: opciones.estado,
    usuarioDAO,
    lugarDAO,
    reporteDAO,
    hasher,
    emisorToken,
  });
  return { contenedor, cfg, usuarioDAO, lugarDAO, reporteDAO, hasher, emisorToken, conexion };
}
