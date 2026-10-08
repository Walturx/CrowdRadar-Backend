import type { DenunciaDAO } from '../../dao/DenunciaDAO.js';
import type { ReporteDAO } from '../../dao/ReporteDAO.js';
import type { Denuncia } from '../../entity/Denuncia.js';
import { EstadoReporte } from '../../enum/EstadoReporte.js';
import { MotivoDenuncia } from '../../enum/MotivoDenuncia.js';
import { ConflictoException } from '../../exception/http/ConflictoException.js';
import { ValidacionException } from '../../exception/http/ValidacionException.js';
import { ReporteNoEncontradoException } from '../../exception/reporte/ReporteNoEncontradoException.js';
import { AutodenunciaException } from '../../exception/validacion/AutodenunciaException.js';
import { DenunciaDuplicadaException } from '../../exception/validacion/DenunciaDuplicadaException.js';
import type { Reloj } from '../../util/Reloj.js';
import type { DenunciaService } from '../DenunciaService.js';

export interface DependenciasDenunciaService {
  reporteDAO: ReporteDAO;
  denunciaDAO: Pick<DenunciaDAO, 'existe' | 'crear'>;
  reloj: Reloj;
}

export const MENSAJE_DETALLE_REQUERIDO = 'Describe el motivo de tu denuncia.';

/** Pattern: Service layer. Creates PENDIENTE complaints; deciding them is the moderation stream (M6). */
export class DenunciaServiceImpl implements DenunciaService {
  constructor(private readonly deps: DependenciasDenunciaService) {}

  async denunciar(usuarioId: number, reporteId: number, motivo: MotivoDenuncia, detalle: string | null): Promise<Denuncia> {
    const { reporteDAO, denunciaDAO, reloj } = this.deps;
    const reporte = await reporteDAO.buscarPorId(reporteId);
    if (!reporte || reporte.estado === EstadoReporte.ELIMINADO) throw new ReporteNoEncontradoException();
    if (reporte.usuarioId === usuarioId) throw new AutodenunciaException();
    const texto = detalle?.trim() || null;
    if (motivo === MotivoDenuncia.OTRO && texto === null) {
      throw new ValidacionException([{ campo: 'detalle', mensaje: MENSAJE_DETALLE_REQUERIDO }]);
    }
    if (await denunciaDAO.existe(usuarioId, reporteId)) throw new DenunciaDuplicadaException();
    try {
      return await denunciaDAO.crear({ reporteId, usuarioId, motivo, detalle: texto, fechaHora: reloj.ahora() });
    } catch (error) {
      // The unique (reporte, usuario) index catches two simultaneous complaints that both passed `existe`.
      if (error instanceof ConflictoException) throw new DenunciaDuplicadaException();
      throw error;
    }
  }
}
