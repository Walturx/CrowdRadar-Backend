import type { AlertaResponseDTO, ListadoAlertasResponseDTO } from '../dto/response/alerta/AlertaResponseDTO.js';
import type { AlertaConLugar, ListadoAlertas } from '../service/AlertaService.js';

/** Pattern: Mapper. The only place that turns an alert into what leaves over HTTP. */
export const AlertaMapper = {
  aResponse({ alerta, lugarNombre }: AlertaConLugar): AlertaResponseDTO {
    return {
      id: alerta.id,
      lugarId: alerta.lugarId,
      lugarNombre,
      nivelAnterior: alerta.nivelAnterior ?? 'SIN_INFORMACION',
      nivelNuevo: alerta.nivelNuevo,
      mensaje: alerta.mensaje,
      leida: alerta.leida,
      fechaHora: alerta.fechaHora.toISOString(),
    };
  },

  aListado({ pagina, noLeidas }: ListadoAlertas): ListadoAlertasResponseDTO {
    const { items, page, size, total, totalPaginas } = pagina;
    return { items: items.map(AlertaMapper.aResponse), page, size, total, totalPaginas, noLeidas };
  },
};
