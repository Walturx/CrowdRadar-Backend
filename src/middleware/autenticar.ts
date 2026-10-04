import type { RequestHandler } from 'express';
import type { ClaimsToken, EmisorToken } from '../adapter/seguridad/EmisorToken.js';
import type { UsuarioDAO } from '../dao/UsuarioDAO.js';
import { CodigoError } from '../exception/CodigoError.js';
import { NoAutenticadoException } from '../exception/base/NoAutenticadoException.js';
import type { VerificadorEstadoCuenta } from '../service/VerificadorEstadoCuenta.js';

export interface DependenciasAutenticar {
  emisorToken: EmisorToken;
  usuarioDAO: Pick<UsuarioDAO, 'buscarPorId'>;
  verificador: VerificadorEstadoCuenta;
}

/** Strict `Authorization: Bearer <token>`: exact scheme, single space, token without spaces. */
const BEARER = /^Bearer (\S+)$/;

const noAutenticado = () =>
  new NoAutenticadoException(CodigoError.NO_AUTENTICADO, 'Debes iniciar sesión para continuar.');
const tokenInvalido = () => new NoAutenticadoException(CodigoError.TOKEN_INVALIDO, 'Token inválido o expirado.');

/**
 * Builds the `autenticar` middleware: verifies the JWT, re-reads the user by id and runs
 * the account status check. Authorization decisions use the database row, never the
 * token claims; the row ends up in `req.usuario`. Dependencies are injected ports.
 */
export function crearAutenticar({ emisorToken, usuarioDAO, verificador }: DependenciasAutenticar): RequestHandler {
  return async (req, _res, next) => {
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw noAutenticado();

    let claims: ClaimsToken;
    try {
      claims = emisorToken.verificar(token);
    } catch {
      throw tokenInvalido();
    }
    if (!Number.isInteger(claims.id)) throw tokenInvalido();

    const usuario = await usuarioDAO.buscarPorId(claims.id);
    if (!usuario) throw tokenInvalido();

    req.usuario = await verificador.verificar(usuario);
    next();
  };
}
