import type { DenunciaCreadaResponseDTO } from '../dto/response/validacion/DenunciaResponseDTO.js';
import type { Denuncia } from '../entity/Denuncia.js';

export const MENSAJE_DENUNCIA_ENVIADA = 'Denuncia enviada. Gracias por avisar, la revisaremos.';

/** Pattern: Mapper. A complaint leaves over HTTP without the complainant or the resolution columns. */
export const DenunciaMapper = {
  aCreada(denuncia: Denuncia): DenunciaCreadaResponseDTO {
    return {
      id: denuncia.id,
      reporteId: denuncia.reporteId,
      motivo: denuncia.motivo,
      detalle: denuncia.detalle,
      estado: denuncia.estado,
      fechaHora: denuncia.fechaHora.toISOString(),
    };
  },
};
