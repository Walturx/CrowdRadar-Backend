import type { Usuario } from '../../entity/Usuario.js';
import type { EstadoCuenta } from '../../enum/EstadoCuenta.js';
import type { Rol } from '../../enum/Rol.js';

/** JWT payload. Informational only: authorization always re-reads the user from the database. */
export interface ClaimsToken {
  sub: string;
  id: number;
  email: string;
  rol: Rol;
  status: EstadoCuenta;
}

export interface TokenEmitido {
  token: string;
  expiraEn: Date;
}

/**
 * Pattern: Adapter (port). Issues and verifies session tokens; JwtEmisorToken adapts
 * jsonwebtoken (BE-05a). `verificar` throws when the token is expired, malformed or
 * badly signed.
 */
export interface EmisorToken {
  emitir(usuario: Usuario): TokenEmitido;
  verificar(token: string): ClaimsToken;
}
