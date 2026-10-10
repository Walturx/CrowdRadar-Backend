import type { Pagina } from '../dao/Paginacion.js';
import type {
  DetalleReporteDenunciadoResponseDTO,
  DetalleUsuarioModeradoResponseDTO,
  ReporteDenunciadoResponseDTO,
  ResolucionResponseDTO,
  SancionResponseDTO,
  UsuarioModeradoResponseDTO,
} from '../dto/response/moderacion/ModeracionResponseDTO.js';
import type { SancionUsuario } from '../entity/SancionUsuario.js';
import type {
  DetalleReporteDenunciado,
  DetalleUsuarioModerado,
  ReporteDenunciadoItem,
  ResultadoResolucion,
  UsuarioModerado,
} from '../facade/ModeracionFacade.js';

export const MENSAJE_SIN_DENUNCIAS = 'Sin denuncias pendientes';
export const MENSAJE_REPORTES_DENUNCIADOS = 'Reportes denunciados obtenidos correctamente.';
export const MENSAJE_DETALLE_DENUNCIADO = 'Reporte denunciado obtenido correctamente.';
export const MENSAJE_RESOLUCION = 'Denuncias resueltas correctamente.';
export const MENSAJE_SIN_USUARIOS = 'No se encontraron usuarios.';
export const MENSAJE_USUARIOS = 'Usuarios obtenidos correctamente.';
export const MENSAJE_DETALLE_USUARIO = 'Usuario obtenido correctamente.';
export const MENSAJE_SUSPENSION = 'Usuario suspendido correctamente.';
export const MENSAJE_REACTIVACION = 'Usuario reactivado correctamente.';

/** Pattern: Mapper. The only place that turns moderation results into what leaves over HTTP (explicit fields, ISO dates). */
export const ModeracionMapper = {
  aSancion(s: SancionUsuario): SancionResponseDTO {
    return {
      id: s.id,
      usuarioId: s.usuarioId,
      dias: s.dias,
      motivo: s.motivo,
      fechaInicio: s.fechaInicio.toISOString(),
      fechaFin: s.fechaFin.toISOString(),
    };
  },

  aReporteDenunciado({ reporte, lugar, autor, pendientes, ultimaDenunciaEn }: ReporteDenunciadoItem): ReporteDenunciadoResponseDTO {
    return {
      reporteId: reporte.id,
      lugar: { id: lugar.id, nombre: lugar.nombre, categoria: lugar.categoria },
      autor: { id: autor.id, nombre: autor.nombre, apellido: autor.apellido },
      nivel: reporte.nivelSaturacion,
      fechaHora: reporte.fechaHora.toISOString(),
      pendientes,
      ultimaDenunciaEn: ultimaDenunciaEn.toISOString(),
    };
  },

  aPaginaReportesDenunciados(pagina: Pagina<ReporteDenunciadoItem>): Pagina<ReporteDenunciadoResponseDTO> {
    return { ...pagina, items: pagina.items.map(ModeracionMapper.aReporteDenunciado) };
  },

  aDetalleReporte({ reporte, lugar, autor, pendientes, motivos }: DetalleReporteDenunciado): DetalleReporteDenunciadoResponseDTO {
    return {
      reporteId: reporte.id,
      lugar: { id: lugar.id, nombre: lugar.nombre, categoria: lugar.categoria },
      autor: { id: autor.id, nombre: autor.nombre, apellido: autor.apellido, email: autor.email },
      nivel: reporte.nivelSaturacion,
      estado: reporte.estado,
      fechaHora: reporte.fechaHora.toISOString(),
      pendientes,
      motivos: motivos.map((m) => ({ motivo: m.motivo, total: m.total })),
    };
  },

  aResolucion({ reporteId, estado, denunciasResueltas }: ResultadoResolucion): ResolucionResponseDTO {
    return { reporteId, estado, denunciasResueltas };
  },

  aUsuario({ usuario, sancionVigente }: UsuarioModerado): UsuarioModeradoResponseDTO {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      rol: usuario.rol,
      status: usuario.status,
      puntosKarma: usuario.puntosKarma,
      sancionVigente: sancionVigente ? ModeracionMapper.aSancion(sancionVigente) : null,
    };
  },

  aPaginaUsuarios(pagina: Pagina<UsuarioModerado>): Pagina<UsuarioModeradoResponseDTO> {
    return { ...pagina, items: pagina.items.map(ModeracionMapper.aUsuario) };
  },

  aDetalleUsuario(detalle: DetalleUsuarioModerado): DetalleUsuarioModeradoResponseDTO {
    return {
      ...ModeracionMapper.aUsuario(detalle),
      reportesPublicados: detalle.reportesPublicados,
      reportesDenunciados: detalle.reportesDenunciados,
    };
  },
};
