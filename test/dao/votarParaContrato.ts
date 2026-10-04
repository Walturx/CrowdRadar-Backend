import type { ValidacionDAO } from '../../src/dao/ValidacionDAO.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';

/** `votar` of the ReporteDAO contract environment: records a CONFIRMAR vote through any ValidacionDAO. */
export const votarEn =
  (validaciones: ValidacionDAO) =>
  async (reporteId: number, usuarioId: number): Promise<void> => {
    await validaciones.crear({
      reporteId,
      usuarioId,
      tipoAccion: TipoAccionValidacion.CONFIRMAR,
      karmaVotante: 0,
      puntosOtorgados: 2,
      fechaHora: new Date(),
    });
  };
