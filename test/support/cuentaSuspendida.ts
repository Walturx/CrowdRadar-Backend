import type { UsuarioDAO } from '../../src/dao/UsuarioDAO.js';
import { VerificadorEstadoCuentaImpl } from '../../src/service/impl/VerificadorEstadoCuentaImpl.js';
import { relojSistema, type Reloj } from '../../src/util/Reloj.js';
import { SancionDAOMemoria } from './dao/memoria/SancionDAOMemoria.js';

const MS_DIA = 86_400_000;

/** The real account-status check over in-memory sanctions, for tests that build a service or middleware by hand. */
export function verificadorMemoria(usuarioDAO: Pick<UsuarioDAO, 'actualizarStatus'>, reloj: Reloj = relojSistema) {
  const sancionDAO = new SancionDAOMemoria({ reloj });
  return { sancionDAO, verificador: new VerificadorEstadoCuentaImpl({ usuarioDAO, sancionDAO, reloj }) };
}

/** A live 3-day sanction that started yesterday: SUSPENDIDO accounts need one, otherwise they are reactivated lazily. */
export function sancionVigente(sancionDAO: SancionDAOMemoria, usuarioId: number, reloj: Reloj = relojSistema) {
  const ahora = reloj.ahora().getTime();
  return sancionDAO.crear({
    usuarioId,
    administradorId: 1,
    dias: 3,
    motivo: 'Reportes falsos reiterados',
    fechaInicio: new Date(ahora - MS_DIA),
    fechaFin: new Date(ahora + 2 * MS_DIA),
  });
}
