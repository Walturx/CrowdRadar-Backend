import { createSecretKey, type KeyObject } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import type { Usuario } from '../../../entity/Usuario.js';
import { EstadoCuenta } from '../../../enum/EstadoCuenta.js';
import { Rol } from '../../../enum/Rol.js';
import type { ClaimsToken, EmisorToken, TokenEmitido } from '../EmisorToken.js';

/** The algorithm is pinned on sign and verify: tokens signed with any other (or `none`) are rejected. */
const ALGORITMO = 'HS256';

const esquemaClaims = z.object({
  sub: z.string(),
  id: z.number().int().positive(),
  email: z.string(),
  rol: z.enum([Rol.USUARIO, Rol.ADMIN]),
  status: z.enum([EstadoCuenta.ACTIVO, EstadoCuenta.SUSPENDIDO]),
  iat: z.number().int().nonnegative(),
});

export interface OpcionesJwt {
  jwtSecreto: string;
  /** `ms`-style duration (e.g. "2h"), from JWT_EXPIRA_EN. */
  jwtExpiraEn: string;
}

/**
 * Pattern: Adapter. jsonwebtoken behind the EmisorToken port. The payload is validated
 * with zod before anything trusts `id`; even then `autenticar` re-reads the user.
 */
export class JwtEmisorTokenAdapter implements EmisorToken {
  /** Built once: given a string, jsonwebtoken creates a KeyObject on every sign and verify (one per request). */
  private readonly clave: KeyObject;

  constructor(private readonly opciones: OpcionesJwt) {
    this.clave = createSecretKey(Buffer.from(opciones.jwtSecreto, 'utf8'));
  }

  emitir(usuario: Usuario): TokenEmitido {
    const claims: Omit<ClaimsToken, 'iat'> = {
      sub: String(usuario.id),
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      status: usuario.status,
    };
    const token = jwt.sign(claims, this.clave, {
      algorithm: ALGORITMO,
      expiresIn: this.opciones.jwtExpiraEn as SignOptions['expiresIn'],
    });
    const { exp } = jwt.decode(token) as { exp: number };
    return { token, expiraEn: new Date(exp * 1000) };
  }

  verificar(token: string): ClaimsToken {
    const payload = jwt.verify(token, this.clave, { algorithms: [ALGORITMO] });
    return esquemaClaims.parse(payload);
  }
}
