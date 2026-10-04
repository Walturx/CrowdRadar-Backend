import type { DispositivoDAO } from '../../dao/DispositivoDAO.js';
import type { PlataformaPush } from '../../enum/PlataformaPush.js';
import type { DispositivoService } from '../DispositivoService.js';

export interface DependenciasDispositivoService {
  dispositivoDAO: DispositivoDAO;
  /** Devices kept per user (DISPOSITIVOS_MAX_POR_USUARIO); the oldest are evicted. */
  maxPorUsuario?: number;
}

const MAX_POR_USUARIO_DEFECTO = 10;

/**
 * Pattern: Service layer. The ownership rule lives in the DAO contract (atomic upsert by token, delete by owner).
 * After each registration the user keeps at most `maxPorUsuario` devices (the least recently registered go first),
 * so a client that keeps rotating tokens cannot grow the table or the push fan-out without bound.
 */
export class DispositivoServiceImpl implements DispositivoService {
  private readonly dispositivoDAO: DispositivoDAO;
  private readonly maxPorUsuario: number;

  constructor({ dispositivoDAO, maxPorUsuario = MAX_POR_USUARIO_DEFECTO }: DependenciasDispositivoService) {
    this.dispositivoDAO = dispositivoDAO;
    this.maxPorUsuario = maxPorUsuario;
  }

  async registrar(usuarioId: number, token: string, plataforma: PlataformaPush): Promise<{ creado: boolean }> {
    const { creado } = await this.dispositivoDAO.registrar(usuarioId, token, plataforma);
    await this.dispositivoDAO.conservarMasRecientes(usuarioId, this.maxPorUsuario);
    return { creado };
  }

  async eliminar(usuarioId: number, token: string): Promise<void> {
    await this.dispositivoDAO.eliminarPorToken(usuarioId, token);
  }
}
