import type { DispositivoDAO } from '../../dao/DispositivoDAO.js';
import type { PlataformaPush } from '../../enum/PlataformaPush.js';
import type { DispositivoService } from '../DispositivoService.js';

export interface DependenciasDispositivoService {
  dispositivoDAO: DispositivoDAO;
}

/** Pattern: Service layer. The ownership rule lives in the DAO contract (atomic upsert by token, delete by owner). */
export class DispositivoServiceImpl implements DispositivoService {
  private readonly dispositivoDAO: DispositivoDAO;

  constructor({ dispositivoDAO }: DependenciasDispositivoService) {
    this.dispositivoDAO = dispositivoDAO;
  }

  async registrar(usuarioId: number, token: string, plataforma: PlataformaPush): Promise<{ creado: boolean }> {
    const { creado } = await this.dispositivoDAO.registrar(usuarioId, token, plataforma);
    return { creado };
  }

  async eliminar(usuarioId: number, token: string): Promise<void> {
    await this.dispositivoDAO.eliminarPorToken(usuarioId, token);
  }
}
