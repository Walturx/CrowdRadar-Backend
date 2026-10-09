import type { Pagina } from '../dao/Paginacion.js';
import type {
  ConfiabilidadDTO,
  DetalleReporteResponseDTO,
  EstadoMiReporteResponseDTO,
  ReportePendienteResponseDTO,
  ValidacionCreadaResponseDTO,
} from '../dto/response/validacion/ValidacionResponseDTO.js';
import { EstadoValidacion } from '../enum/EstadoValidacion.js';
import { NivelConfiabilidad } from '../enum/NivelConfiabilidad.js';
import type {
  ConfiabilidadReporte,
  DetalleReporte,
  EstadoMiReporte,
  ReportePendiente,
  ResultadoValidacion,
} from '../service/ValidacionService.js';

export const ADVERTENCIA_CONFIABILIDAD_BAJA = 'Este reporte tiene pocas confirmaciones. Tómalo con precaución.';
export const MENSAJE_SIN_PENDIENTES = 'No hay reportes pendientes de validar cerca de ti.';
export const MENSAJE_PENDIENTES = 'Reportes pendientes obtenidos correctamente.';
export const MENSAJE_DETALLE_REPORTE = 'Reporte obtenido correctamente.';
export const MENSAJE_CONFIABILIDAD = 'Confiabilidad obtenida correctamente.';
export const MENSAJE_SIN_VALIDACIONES = 'Todavía no existen validaciones registradas.';
export const MENSAJE_ESTADO_MIS_REPORTES = 'Estado de validación obtenido correctamente.';
export const MENSAJE_SIN_REPORTES_PROPIOS = 'Aún no tienes reportes';

/** Pattern: Mapper. The only place that turns validation results into what leaves over HTTP (explicit fields, ISO dates). */
export const ValidacionMapper = {
  aConfiabilidad(c: ConfiabilidadReporte): ConfiabilidadDTO {
    return {
      porcentaje: c.porcentaje,
      nivel: c.nivel,
      confirmaciones: c.confirmaciones,
      rechazos: c.rechazos,
      advertencia: c.nivel === NivelConfiabilidad.BAJA ? ADVERTENCIA_CONFIABILIDAD_BAJA : null,
    };
  },

  aPendiente({ reporte, lugar, distanciaMetros, confiabilidad }: ReportePendiente): ReportePendienteResponseDTO {
    return {
      id: reporte.id,
      lugar: { id: lugar.id, nombre: lugar.nombre, categoria: lugar.categoria },
      nivel: reporte.nivelSaturacion,
      fechaHora: reporte.fechaHora.toISOString(),
      distanciaMetros: Math.round(distanciaMetros),
      confiabilidad: ValidacionMapper.aConfiabilidad(confiabilidad),
    };
  },

  aPaginaPendientes(pagina: Pagina<ReportePendiente>): Pagina<ReportePendienteResponseDTO> {
    return { ...pagina, items: pagina.items.map(ValidacionMapper.aPendiente) };
  },

  aDetalle({ reporte, lugar, confiabilidad, miValidacion, yaDenunciado, esPropio }: DetalleReporte): DetalleReporteResponseDTO {
    return {
      id: reporte.id,
      lugar: { id: lugar.id, nombre: lugar.nombre, categoria: lugar.categoria },
      nivel: reporte.nivelSaturacion,
      fechaHora: reporte.fechaHora.toISOString(),
      confiabilidad: ValidacionMapper.aConfiabilidad(confiabilidad),
      estadoValidacion: confiabilidad.estado,
      miValidacion,
      yaDenunciado,
      esPropio,
    };
  },

  aCreada({ validacion, karma, confiabilidad }: ResultadoValidacion): ValidacionCreadaResponseDTO {
    return {
      validacion: {
        id: validacion.id,
        reporteId: validacion.reporteId,
        tipoAccion: validacion.tipoAccion,
        fechaHora: validacion.fechaHora.toISOString(),
      },
      karma: { puntosGanados: karma.puntosGanados, total: karma.total },
      confiabilidad: ValidacionMapper.aConfiabilidad(confiabilidad),
      estadoValidacion: confiabilidad.estado,
    };
  },

  aEstadoMiReporte({ reporte, lugarNombre, confiabilidad }: EstadoMiReporte): EstadoMiReporteResponseDTO {
    return {
      reporteId: reporte.id,
      lugar: { id: reporte.lugarId, nombre: lugarNombre },
      nivel: reporte.nivelSaturacion,
      fechaHora: reporte.fechaHora.toISOString(),
      confiabilidad: ValidacionMapper.aConfiabilidad(confiabilidad),
      estadoValidacion: confiabilidad.estado,
    };
  },

  aPaginaEstado(pagina: Pagina<EstadoMiReporte>): Pagina<EstadoMiReporteResponseDTO> {
    return { ...pagina, items: pagina.items.map(ValidacionMapper.aEstadoMiReporte) };
  },

  /** Message of the overview: nothing to list, reports nobody voted on yet, or the normal one. */
  mensajeEstado(pagina: Pagina<EstadoMiReporte>): string {
    if (pagina.total === 0) return MENSAJE_SIN_REPORTES_PROPIOS;
    return pagina.items.every((i) => i.confiabilidad.estado === EstadoValidacion.SIN_VALIDACIONES)
      ? MENSAJE_SIN_VALIDACIONES
      : MENSAJE_ESTADO_MIS_REPORTES;
  },
};
