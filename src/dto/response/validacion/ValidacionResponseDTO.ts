import type { CategoriaLugar } from '../../../enum/CategoriaLugar.js';
import type { EstadoValidacion } from '../../../enum/EstadoValidacion.js';
import type { NivelConfiabilidad } from '../../../enum/NivelConfiabilidad.js';
import type { NivelSaturacion } from '../../../enum/NivelSaturacion.js';
import type { TipoAccionValidacion } from '../../../enum/TipoAccionValidacion.js';

/** The reliability block shared by every M5 response. Counts are raw votes; `porcentaje` is weighted. */
export interface ConfiabilidadDTO {
  /** 0..100 with 2 decimals; null while the level is INSUFICIENTE. */
  porcentaje: number | null;
  nivel: NivelConfiabilidad;
  confirmaciones: number;
  rechazos: number;
  /** Shown to the user when the level is BAJA; null otherwise. */
  advertencia: string | null;
}

export interface LugarReporteDTO {
  id: number;
  nombre: string;
  categoria: CategoriaLugar;
}

/** One item of GET /api/validaciones/pendientes. */
export interface ReportePendienteResponseDTO {
  id: number;
  lugar: LugarReporteDTO;
  nivel: NivelSaturacion;
  /** ISO 8601. */
  fechaHora: string;
  /** Straight-line distance from the caller to the place, rounded to metres. */
  distanciaMetros: number;
  confiabilidad: ConfiabilidadDTO;
}

/** data of GET /api/reportes/:id. The author of the report is never exposed. */
export interface DetalleReporteResponseDTO {
  id: number;
  lugar: LugarReporteDTO;
  nivel: NivelSaturacion;
  /** ISO 8601. */
  fechaHora: string;
  confiabilidad: ConfiabilidadDTO;
  estadoValidacion: EstadoValidacion;
  miValidacion: TipoAccionValidacion | null;
  yaDenunciado: boolean;
  esPropio: boolean;
}

/** data of POST /api/reportes/:id/validaciones. */
export interface ValidacionCreadaResponseDTO {
  validacion: { id: number; reporteId: number; tipoAccion: TipoAccionValidacion; fechaHora: string };
  karma: { puntosGanados: number; total: number };
  confiabilidad: ConfiabilidadDTO;
  estadoValidacion: EstadoValidacion;
}

/** One item of GET /api/reportes/mios/validacion. */
export interface EstadoMiReporteResponseDTO {
  reporteId: number;
  lugar: { id: number; nombre: string };
  nivel: NivelSaturacion;
  /** ISO 8601. */
  fechaHora: string;
  confiabilidad: ConfiabilidadDTO;
  estadoValidacion: EstadoValidacion;
}
