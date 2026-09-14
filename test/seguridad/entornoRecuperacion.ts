/** Shared fixture of the recovery facade tests: in-memory DAOs, fake generator/hasher/mail and a pinned clock. */
import type { ContextoTx } from '../../src/datasource/ConexionBD.js';
import { RecuperacionFacadeImpl, type DependenciasRecuperacionFacade } from '../../src/facade/impl/RecuperacionFacadeImpl.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { crearLoggerEspia, type LineaLog } from '../support/LoggerEspia.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { CorreoEspia } from '../support/adapter/CorreoEspia.js';
import { GeneradorTokenFijo } from '../support/adapter/GeneradorTokenFijo.js';
import { HasherFalso } from '../support/adapter/HasherFalso.js';
import { TokenRecuperacionDAOMemoria } from '../support/dao/memoria/TokenRecuperacionDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { aUsuario } from '../support/fabrica/datos.js';

export const AHORA = new Date('2026-10-05T14:00:00Z');
export const EMAIL = 'ana.ruiz@crowdradar.pe';
export const PASSWORD_ACTUAL = 'Vieja1234';
export const URL_PUBLICA = 'https://crowdradar.test';

/** ConexionFalsa that records every transaction handle and how many finished without throwing (the in-memory commit). */
export class ConexionRegistradora extends ConexionFalsa {
  confirmadas = 0;
  readonly handles: ContextoTx[] = [];
  override async transaccion<T>(trabajo: (tx: ContextoTx) => Promise<T>): Promise<T> {
    const resultado = await super.transaccion((tx) => {
      this.handles.push(tx);
      return trabajo(tx);
    });
    this.confirmadas += 1;
    return resultado;
  }
}

/** CorreoEspia that notes how many transactions had committed when each message left. */
export class CorreoConOrden extends CorreoEspia {
  readonly confirmadasAlEnviar: number[] = [];
  constructor(private readonly conexion: ConexionRegistradora) {
    super();
  }
  override async enviar(mensaje: Parameters<CorreoEspia['enviar']>[0]): Promise<void> {
    this.confirmadasAlEnviar.push(this.conexion.confirmadas);
    return super.enviar(mensaje);
  }
}

export function crearEntornoRecuperacion(
  opciones: { tokens?: string[]; politicaMensajes?: 'GENERICA' | 'DETALLADA'; expiraMin?: number } = {},
) {
  const reloj = new RelojFijo(AHORA);
  const usuarioDAO = new UsuarioDAOMemoria({ reloj });
  const tokenDAO = new TokenRecuperacionDAOMemoria({ reloj });
  const hasher = new HasherFalso();
  const generador = new GeneradorTokenFijo(opciones.tokens ?? ['tok-1', 'tok-2', 'tok-3', 'tok-4']);
  const conexion = new ConexionRegistradora();
  const correo = new CorreoConOrden(conexion);
  const { logger, lineas } = crearLoggerEspia();
  const usuario = usuarioDAO.agregar(aUsuario({ email: EMAIL, passwordHash: `hash:${PASSWORD_ACTUAL}` }));
  const deps: DependenciasRecuperacionFacade = {
    usuarioDAO,
    tokenDAO,
    hasher,
    generador,
    correo,
    conexion,
    reloj,
    logger,
    expiraMin: opciones.expiraMin ?? 30,
    urlPublica: URL_PUBLICA,
    politicaMensajes: opciones.politicaMensajes ?? 'GENERICA',
  };
  return {
    facade: new RecuperacionFacadeImpl(deps),
    deps,
    reloj,
    usuarioDAO,
    tokenDAO,
    hasher,
    generador,
    conexion,
    correo,
    lineas,
    usuario,
    /** Hash the generator derives from a plain token (what the DAO stores). */
    hashDe: (token: string) => generador.hashear(token),
  };
}

export type EntornoRecuperacion = ReturnType<typeof crearEntornoRecuperacion>;

/** Lets the fire-and-forget mail send settle (its failure is logged after a few microtasks). */
export const asentar = () => new Promise<void>((resolver) => setImmediate(resolver));

export const lineaCon = (lineas: LineaLog[], texto: string) => lineas.find((l) => String(l.msg).includes(texto));
