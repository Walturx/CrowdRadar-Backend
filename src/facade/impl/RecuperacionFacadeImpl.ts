import { timingSafeEqual } from 'node:crypto';
import type { EnviadorCorreo } from '../../adapter/correo/EnviadorCorreo.js';
import type { GeneradorToken } from '../../adapter/seguridad/GeneradorToken.js';
import type { Hasher } from '../../adapter/seguridad/Hasher.js';
import type { DispositivoDAO } from '../../dao/DispositivoDAO.js';
import type { TokenRecuperacionDAO } from '../../dao/TokenRecuperacionDAO.js';
import type { UsuarioDAO } from '../../dao/UsuarioDAO.js';
import type { ConexionBD, ContextoTx } from '../../datasource/ConexionBD.js';
import type { TokenRecuperacion } from '../../entity/TokenRecuperacion.js';
import type { Usuario } from '../../entity/Usuario.js';
import { TokenRecuperacionExpiradoException } from '../../exception/recuperacion/TokenRecuperacionExpiradoException.js';
import { TokenRecuperacionInvalidoException } from '../../exception/recuperacion/TokenRecuperacionInvalidoException.js';
import { CuentaNoExisteException } from '../../exception/usuario/CuentaNoExisteException.js';
import { PasswordRepetidaException } from '../../exception/usuario/PasswordRepetidaException.js';
import { enmascararEmail } from '../../util/enmascarar.js';
import type { Logger } from '../../util/logger.js';
import type { Reloj } from '../../util/Reloj.js';
import { MS_POR_MINUTO } from '../../util/tiempo.js';
import type { RecuperacionFacade } from '../RecuperacionFacade.js';

export interface DependenciasRecuperacionFacade {
  usuarioDAO: UsuarioDAO;
  tokenDAO: TokenRecuperacionDAO;
  /** A reset ends the user's push sessions: their devices are deleted. */
  dispositivoDAO: DispositivoDAO;
  hasher: Hasher;
  generador: GeneradorToken;
  correo: EnviadorCorreo;
  conexion: ConexionBD;
  reloj: Reloj;
  logger: Logger;
  /** RECUPERACION_EXPIRA_MIN. */
  expiraMin: number;
  /** URL_PUBLICA: base of the link in the mail. */
  urlPublica: string;
  /** DETALLADA answers 404 for an unknown email; GENERICA hides it. */
  politicaMensajes: 'GENERICA' | 'DETALLADA';
}

/** Live recovery links one user can hold at once; the oldest is dropped, so a request flood cannot bury the real link nor pile up tokens. */
export const MAX_TOKENS_VIGENTES = 3;

const escaparHtml = (texto: string): string =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const iguales = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Pattern: Facade. Orchestrates the six collaborators of the password recovery flow so the controller sees three
 * calls. The mail leaves after the transaction committed and never fails the request. No token or email in clear
 * is ever logged.
 */
export class RecuperacionFacadeImpl implements RecuperacionFacade {
  constructor(private readonly deps: DependenciasRecuperacionFacade) {}

  async solicitar(email: string): Promise<void> {
    const { usuarioDAO, tokenDAO, generador, conexion, reloj, logger, expiraMin, politicaMensajes } = this.deps;
    const usuario = await usuarioDAO.buscarPorEmail(email);
    const emailEnmascarado = enmascararEmail(email);
    if (!usuario) {
      logger.info({ evento: 'recuperacion.solicitud', resultado: 'desconocido', email: emailEnmascarado }, 'Recuperación solicitada');
      if (politicaMensajes === 'DETALLADA') throw new CuentaNoExisteException();
      return;
    }

    const token = generador.generar();
    const ahora = reloj.ahora();
    await conexion.transaccion(async (tx) => {
      // A new request does not kill the link already mailed (a hostile request would otherwise lock the owner out):
      // the older tokens stay valid until they expire, are spent or fall out of the newest MAX_TOKENS_VIGENTES.
      await tokenDAO.crear(
        { usuarioId: usuario.id, tokenHash: generador.hashear(token), expiraEn: new Date(ahora.getTime() + expiraMin * MS_POR_MINUTO) },
        tx,
      );
      await tokenDAO.limitarVigentes(usuario.id, MAX_TOKENS_VIGENTES, ahora, tx);
    });
    logger.info({ evento: 'recuperacion.solicitud', resultado: 'enviada', email: emailEnmascarado }, 'Recuperación solicitada');
    // Not awaited: the answer must not depend on the mail provider (nor reveal, by its latency, that the account exists).
    void this.enviarEnlace(usuario, token);
  }

  async validarToken(token: string): Promise<void> {
    this.exigirVigente(await this.buscarPorToken(token));
  }

  /** Flow of the white-box test (CC = 7): unknown/used, expired, user missing, repeated password, lost claim, success. */
  async restablecer(token: string, nuevaPassword: string): Promise<void> {
    const { usuarioDAO, tokenDAO, dispositivoDAO, hasher, conexion, reloj, logger } = this.deps;
    await conexion.transaccion(async (tx) => {
      const registro = this.exigirVigente(await this.buscarPorToken(token, tx));
      const usuario = await usuarioDAO.buscarPorId(registro.usuarioId, tx);
      if (!usuario) throw new TokenRecuperacionInvalidoException();
      if (await hasher.comparar(nuevaPassword, usuario.passwordHash ?? '')) throw new PasswordRepetidaException();

      // Spends this token and every other live one of the user in one UPDATE. Under concurrency the loser finds
      // nothing left to spend, so a token works exactly once.
      if ((await tokenDAO.invalidarVigentesDeUsuario(usuario.id, reloj.ahora(), tx)) === 0) throw new TokenRecuperacionInvalidoException();
      await usuarioDAO.actualizarPasswordHash(usuario.id, await hasher.generar(nuevaPassword), tx);
      await dispositivoDAO.eliminarDeUsuario(usuario.id, tx);
      logger.info({ evento: 'recuperacion.restablecimiento', resultado: 'ok', usuarioId: usuario.id }, 'Contraseña restablecida');
    });
  }

  /** Lookup by hash, then a constant-time comparison of the stored hash with the computed one. */
  private async buscarPorToken(token: string, tx?: ContextoTx): Promise<TokenRecuperacion | null> {
    const hash = this.deps.generador.hashear(token);
    const registro = await this.deps.tokenDAO.buscarPorHash(hash, tx);
    return registro && iguales(registro.tokenHash, hash) ? registro : null;
  }

  private exigirVigente(registro: TokenRecuperacion | null): TokenRecuperacion {
    if (!registro || registro.usadoEn) throw new TokenRecuperacionInvalidoException();
    if (registro.expiraEn.getTime() <= this.deps.reloj.ahora().getTime()) throw new TokenRecuperacionExpiradoException();
    return registro;
  }

  /** Never rejects: a mail outage is logged (error name only, since the message may echo the address) and swallowed. */
  private async enviarEnlace(usuario: Usuario, token: string): Promise<void> {
    const { correo, logger, urlPublica, expiraMin } = this.deps;
    const enlace = `${urlPublica.replace(/\/+$/, '')}/recuperar/restablecer?token=${encodeURIComponent(token)}`;
    try {
      await correo.enviar({
        para: usuario.email,
        asunto: 'Restablece tu contraseña de CrowdRadar',
        texto: `Hola ${usuario.nombre}, usa este enlace para elegir una nueva contraseña (vale ${expiraMin} minutos): ${enlace}`,
        html: `<p>Hola ${escaparHtml(usuario.nombre)},</p><p><a href="${enlace}">Elige una nueva contraseña</a>. El enlace vale ${expiraMin} minutos.</p>`,
      });
    } catch (error) {
      logger.error(
        { evento: 'recuperacion.correo_fallido', usuarioId: usuario.id, tipoError: error instanceof Error ? error.name : 'desconocido' },
        'No se pudo enviar el correo de recuperación',
      );
    }
  }
}
