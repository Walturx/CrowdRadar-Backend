import type { Usuario } from '../../entity/Usuario.js';
import { EstadoCuenta } from '../../enum/EstadoCuenta.js';
import { CuentaSuspendidaException } from '../../exception/usuario/CuentaSuspendidaException.js';
import type { VerificadorEstadoCuenta } from '../VerificadorEstadoCuenta.js';

/** C0 minimal version: any status other than ACTIVO is rejected. M6 adds sanction expiry. */
export class VerificadorEstadoCuentaImpl implements VerificadorEstadoCuenta {
  async verificar(usuario: Usuario): Promise<Usuario> {
    if (usuario.status !== EstadoCuenta.ACTIVO) throw new CuentaSuspendidaException();
    return usuario;
  }
}
