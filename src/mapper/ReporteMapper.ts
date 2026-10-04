import type { Pagina } from '../dao/Paginacion.js';
import type { ReporteCreadoResponseDTO } from '../dto/response/reporte/ReporteResponseDTO.js';
import type { ReporteResumenDTO } from '../dto/response/reporte/ReporteResumenDTO.js';
import type { ReporteSaturacion } from '../entity/ReporteSaturacion.js';
import type { ReporteRegistrado } from '../facade/ReporteFacade.js';
import type { ReporteDeUsuario } from '../service/ReporteService.js';

/** Pattern: Mapper. The only place that turns report entities into what leaves over HTTP (explicit fields, ISO dates). */
export const ReporteMapper = {
  aResumen(reporte: ReporteSaturacion, lugarNombre: string): ReporteResumenDTO {
    return {
      id: reporte.id,
      lugar: { id: reporte.lugarId, nombre: lugarNombre },
      nivel: reporte.nivelSaturacion,
      fechaHora: reporte.fechaHora.toISOString(),
      estado: reporte.estado,
      puntosOtorgados: reporte.puntosOtorgados,
      motivoSinPuntos: reporte.motivoSinPuntos,
    };
  },

  aCreado({ reporte, karma, lugar }: ReporteRegistrado): ReporteCreadoResponseDTO {
    return {
      reporte: {
        id: reporte.id,
        lugarId: reporte.lugarId,
        nivel: reporte.nivelSaturacion,
        fechaHora: reporte.fechaHora.toISOString(),
      },
      karma: { puntosGanados: karma.puntosGanados, total: karma.total, motivoSinPuntos: karma.motivoSinPuntos },
      saturacionLugar: {
        nivel: lugar.saturacionActual,
        actualizadoEn: lugar.saturacionActualizadaEn?.toISOString() ?? null,
      },
    };
  },

  aPagina(pagina: Pagina<ReporteDeUsuario>): Pagina<ReporteResumenDTO> {
    return { ...pagina, items: pagina.items.map((i) => ReporteMapper.aResumen(i.reporte, i.lugarNombre)) };
  },
};
