import type { Denuncia } from '../entity/Denuncia.js';
import type { MotivoDenuncia } from '../enum/MotivoDenuncia.js';

/**
 * Pattern: Service layer. A user reports another user's report (HU 5.x). Owner: M5; M6 resolves what it creates.
 * Throws AutodenunciaException (422), DenunciaDuplicadaException (409), ReporteNoEncontradoException (404).
 */
export interface DenunciaService {
  /** `detalle` is required when `motivo` is OTRO. */
  denunciar(usuarioId: number, reporteId: number, motivo: MotivoDenuncia, detalle: string | null): Promise<Denuncia>;
}
