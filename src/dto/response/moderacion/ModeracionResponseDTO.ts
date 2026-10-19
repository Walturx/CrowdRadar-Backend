import type { CategoriaLugar } from '../../../enum/CategoriaLugar.js';
import type { EstadoCuenta } from '../../../enum/EstadoCuenta.js';
import type { EstadoReporte } from '../../../enum/EstadoReporte.js';
import type { MotivoDenuncia } from '../../../enum/MotivoDenuncia.js';
import type { NivelSaturacion } from '../../../enum/NivelSaturacion.js';
import type { Rol } from '../../../enum/Rol.js';

export interface LugarModeracionDTO {
  id: number;
  nombre: string;
  categoria: CategoriaLugar;
}

export interface AutorModeracionDTO {
  id: number;
  nombre: string;
  apellido: string;
}

/** One row of GET /api/admin/reportes-denunciados. Dates are ISO 8601. */
export interface ReporteDenunciadoResponseDTO {
  reporteId: number;
  lugar: LugarModeracionDTO;
  autor: AutorModeracionDTO;
  nivel: NivelSaturacion;
  fechaHora: string;
  pendientes: number;
  ultimaDenunciaEn: string;
}

export interface DetalleReporteDenunciadoResponseDTO {
  reporteId: number;
  lugar: LugarModeracionDTO;
  autor: AutorModeracionDTO & { email: string };
  nivel: NivelSaturacion;
  estado: EstadoReporte;
  fechaHora: string;
  pendientes: number;
  motivos: { motivo: MotivoDenuncia; total: number }[];
}

export interface ResolucionResponseDTO {
  reporteId: number;
  estado: EstadoReporte;
  denunciasResueltas: number;
}

export interface SancionResponseDTO {
  id: number;
  usuarioId: number;
  dias: number;
  motivo: string;
  fechaInicio: string;
  fechaFin: string;
}

/** User of the admin directory; never carries the password hash. */
export interface UsuarioModeradoResponseDTO {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  rol: Rol;
  status: EstadoCuenta;
  puntosKarma: number;
  sancionVigente: SancionResponseDTO | null;
}

export interface DetalleUsuarioModeradoResponseDTO extends UsuarioModeradoResponseDTO {
  reportesPublicados: number;
  reportesDenunciados: number;
}
