import type { Usuario } from '../entity/Usuario.js';

/**
 * Pattern: Service layer (port). Owner: C0 (minimal), M6 completes with sanctions.
 * Service port used by login and `autenticar`: returns the user when the account may
 * operate and throws CuentaSuspendidaException otherwise. Async so the sanction-aware
 * version (M6) can read and update the database.
 */
export interface VerificadorEstadoCuenta {
  verificar(usuario: Usuario): Promise<Usuario>;
}
