import type { Usuario } from '../entity/Usuario.js';

/**
 * Service port used by login and `autenticar`: returns the user when the account may
 * operate and throws CuentaSuspendidaException otherwise. Async so the sanction-aware
 * version (M6) can read and update the database.
 */
export interface VerificadorEstadoCuenta {
  verificar(usuario: Usuario): Promise<Usuario>;
}
