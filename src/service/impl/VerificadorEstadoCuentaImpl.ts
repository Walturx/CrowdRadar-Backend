import type { SancionDAO } from '../../dao/SancionDAO.js';
import type { UsuarioDAO } from '../../dao/UsuarioDAO.js';
import type { Usuario } from '../../entity/Usuario.js';
import { EstadoCuenta } from '../../enum/EstadoCuenta.js';
import { CuentaSuspendidaException } from '../../exception/usuario/CuentaSuspendidaException.js';
import type { Reloj } from '../../util/Reloj.js';
import type { VerificadorEstadoCuenta } from '../VerificadorEstadoCuenta.js';

export interface DependenciasVerificador {
  usuarioDAO: Pick<UsuarioDAO, 'actualizarStatus'>;
  sancionDAO: Pick<SancionDAO, 'buscarVigente'>;
  reloj: Reloj;
}

/**
 * Account status check with lazy sanction expiry (no job): a SUSPENDIDO account with a live sanction (`fechaFin` after now)
 * is rejected with the end date; one whose sanction expired (`fechaFin <= now`) or that has none is set back to ACTIVO and
 * allowed through. The sanction row is left untouched: it is history, and only an admin reactivation stamps `levantada_por`.
 */
export class VerificadorEstadoCuentaImpl implements VerificadorEstadoCuenta {
  constructor(private readonly deps: DependenciasVerificador) {}

  async verificar(usuario: Usuario): Promise<Usuario> {
    if (usuario.status === EstadoCuenta.ACTIVO) return usuario;
    const { usuarioDAO, sancionDAO, reloj } = this.deps;
    const vigente = await sancionDAO.buscarVigente(usuario.id, reloj.ahora());
    if (vigente) {
      throw new CuentaSuspendidaException(`Tu cuenta está suspendida hasta el ${vigente.fechaFin.toISOString()}.`);
    }
    return (await usuarioDAO.actualizarStatus(usuario.id, EstadoCuenta.ACTIVO)) ?? { ...usuario, status: EstadoCuenta.ACTIVO };
  }
}
