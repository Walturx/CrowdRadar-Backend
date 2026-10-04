import type { ClaimsToken, EmisorToken, TokenEmitido } from '../../../src/adapter/seguridad/EmisorToken.js';
import type { Usuario } from '../../../src/entity/Usuario.js';

/**
 * Fake EmisorToken: `registrar` makes a token string valid with the given claims;
 * anything else fails verification like an expired or tampered JWT would.
 */
export class EmisorTokenFalso implements EmisorToken {
  private readonly validos = new Map<string, ClaimsToken>();

  registrar(token: string, claims: ClaimsToken): string {
    this.validos.set(token, claims);
    return token;
  }

  emitir(usuario: Usuario): TokenEmitido {
    const token = `token-de-${usuario.id}`;
    this.registrar(token, {
      sub: String(usuario.id),
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      status: usuario.status,
    });
    return { token, expiraEn: new Date('2026-10-05T12:00:00Z') };
  }

  verificar(token: string): ClaimsToken {
    const claims = this.validos.get(token);
    if (!claims) throw new Error('token inválido o expirado');
    return claims;
  }
}
