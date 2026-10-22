import type { EmisorToken } from '../../src/adapter/seguridad/EmisorToken.js';
import type { Hasher } from '../../src/adapter/seguridad/Hasher.js';
import { BcryptHasherAdapter } from '../../src/adapter/seguridad/impl/BcryptHasherAdapter.js';
import { JwtEmisorTokenAdapter } from '../../src/adapter/seguridad/impl/JwtEmisorTokenAdapter.js';
import type { ConfiguracionApp } from '../../src/config/ConfiguracionApp.js';
import type { Contenedor } from '../../src/container/Contenedor.js';
import type { DaosFavoritoAlerta } from '../../src/container/favoritoAlerta.js';
import { ensamblar } from '../../src/container/index.js';
import { resolverNombresDesde } from '../../src/dao/ResolverNombresLugar.js';
import type { SaturacionSubject } from '../../src/pattern/observer/SaturacionSubject.js';
import type { EstadoServicio } from '../../src/util/EstadoServicio.js';
import type { Logger } from '../../src/util/logger.js';
import type { Reloj } from '../../src/util/Reloj.js';
import { ConexionFalsa } from './ConexionFalsa.js';
import { crearLoggerSilencioso } from './LoggerSilencioso.js';
import { CorreoEspia } from './adapter/CorreoEspia.js';
import { GeneradorTokenFijo } from './adapter/GeneradorTokenFijo.js';
import { NotificadorEspia } from './adapter/NotificadorEspia.js';
import { AlertaDAOMemoria } from './dao/memoria/AlertaDAOMemoria.js';
import { DenunciaDAOMemoria } from './dao/memoria/DenunciaDAOMemoria.js';
import { DispositivoDAOMemoria } from './dao/memoria/DispositivoDAOMemoria.js';
import { FavoritoDAOMemoria } from './dao/memoria/FavoritoDAOMemoria.js';
import { LugarDAOMemoria } from './dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from './dao/memoria/ReporteDAOMemoria.js';
import { SancionDAOMemoria } from './dao/memoria/SancionDAOMemoria.js';
import { TokenRecuperacionDAOMemoria } from './dao/memoria/TokenRecuperacionDAOMemoria.js';
import { UsuarioDAOMemoria } from './dao/memoria/UsuarioDAOMemoria.js';
import { ValidacionDAOMemoria } from './dao/memoria/ValidacionDAOMemoria.js';
import { configPrueba, type SobrescritosEntorno } from './configPrueba.js';

export interface OpcionesContenedorPrueba {
  /** Env-style configuration overrides (e.g. `{ POLITICA_MENSAJES_AUTH: 'DETALLADA' }`). */
  cfg?: SobrescritosEntorno;
  usuarioDAO?: UsuarioDAOMemoria;
  /** Pinned clock for time-dependent flows (analytics windows, cooldown). */
  reloj?: Reloj;
  lugarDAO?: LugarDAOMemoria;
  favoritoDAO?: FavoritoDAOMemoria;
  reporteDAO?: ReporteDAOMemoria;
  validacionDAO?: ValidacionDAOMemoria;
  denunciaDAO?: DenunciaDAOMemoria;
  sancionDAO?: SancionDAOMemoria;
  hasher?: Hasher;
  emisorToken?: EmisorToken;
  conexion?: ConexionFalsa;
  /** Recovery stream (M1): in-memory token DAO, mail spy and a generator that hands out these tokens in order. */
  tokenDAO?: TokenRecuperacionDAOMemoria;
  tokensRecuperacion?: readonly string[];
  logger?: Logger;
  estado?: EstadoServicio;
  /** Subject shared by publishers and subscribers; a fresh publisher when omitted. Tests subscribe extra observers to it. */
  subject?: SaturacionSubject;
}

export interface ContenedorPrueba {
  contenedor: Contenedor;
  cfg: ConfiguracionApp;
  usuarioDAO: UsuarioDAOMemoria;
  lugarDAO: LugarDAOMemoria;
  favoritoDAO: FavoritoDAOMemoria;
  reporteDAO: ReporteDAOMemoria;
  /** M5 stream: the in-memory vote and complaint DAOs the container was built with. */
  validacionDAO: ValidacionDAOMemoria;
  denunciaDAO: DenunciaDAOMemoria;
  /** M6 stream: the in-memory sanction DAO behind the account-status check. */
  sancionDAO: SancionDAOMemoria;
  hasher: Hasher;
  emisorToken: EmisorToken;
  conexion: ConexionFalsa;
  /** M3 stream: in-memory DAOs and the push spy the container was built with. */
  favoritoAlerta: DaosFavoritoAlerta & { notificador: NotificadorEspia };
  alertaDAO: AlertaDAOMemoria;
  dispositivoDAO: DispositivoDAOMemoria;
  notificador: NotificadorEspia;
  /** M1 stream: the in-memory token DAO and the mail spy the container was built with. */
  tokenDAO: TokenRecuperacionDAOMemoria;
  correo: CorreoEspia;
}

/**
 * Same composition root as production (`ensamblar`) fed with in-memory DAOs and fakes:
 * no database, no network. Real bcrypt (cost 4) and real JWT keep the auth flow honest.
 */
export function crearContenedorPrueba(opciones: OpcionesContenedorPrueba = {}): ContenedorPrueba {
  const cfg = configPrueba(opciones.cfg);
  const usuarioDAO = opciones.usuarioDAO ?? new UsuarioDAOMemoria();
  const lugarDAO = opciones.lugarDAO ?? new LugarDAOMemoria();
  const validacionDAO = opciones.validacionDAO ?? new ValidacionDAOMemoria();
  const reporteDAO = opciones.reporteDAO ?? new ReporteDAOMemoria({ validaciones: validacionDAO });
  const denunciaDAO = opciones.denunciaDAO ?? new DenunciaDAOMemoria();
  const sancionDAO = opciones.sancionDAO ?? new SancionDAOMemoria({ reloj: opciones.reloj });
  const hasher = opciones.hasher ?? new BcryptHasherAdapter(cfg.seguridad.bcryptCosto);
  const emisorToken = opciones.emisorToken ?? new JwtEmisorTokenAdapter(cfg.seguridad);
  const conexion = opciones.conexion ?? new ConexionFalsa();
  const alertaDAO = new AlertaDAOMemoria();
  const favoritoDAO = opciones.favoritoDAO ?? new FavoritoDAOMemoria({ alertas: alertaDAO });
  const dispositivoDAO = new DispositivoDAOMemoria();
  const notificador = new NotificadorEspia();
  const tokenDAO = opciones.tokenDAO ?? new TokenRecuperacionDAOMemoria();
  const correo = new CorreoEspia();
  const favoritoAlerta = {
    favoritoDAO,
    alertaDAO,
    dispositivoDAO,
    nombresLugar: resolverNombresDesde(lugarDAO),
    notificador,
  };
  const contenedor = ensamblar(
    {
      cfg,
      logger: opciones.logger ?? crearLoggerSilencioso(),
      conexion,
      estado: opciones.estado,
      subject: opciones.subject,
      reloj: opciones.reloj,
      usuarioDAO,
      lugarDAO,
      reporteDAO,
      sancionDAO,
      hasher,
      emisorToken,
      seguridad: { tokenDAO, dispositivoDAO, correo, generador: new GeneradorTokenFijo(opciones.tokensRecuperacion ?? Array.from({ length: 50 }, (_, i) => `token-recuperacion-${i + 1}`)) },
    },
    { favoritoAlerta, validacion: { validacionDAO, denunciaDAO } },
  );
  return {
    contenedor,
    cfg,
    usuarioDAO,
    lugarDAO,
    favoritoDAO,
    reporteDAO,
    validacionDAO,
    denunciaDAO,
    sancionDAO,
    hasher,
    emisorToken,
    conexion,
    favoritoAlerta,
    alertaDAO,
    dispositivoDAO,
    notificador,
    tokenDAO,
    correo,
  };
}
