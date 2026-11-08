import type { CategoriaLugar } from '../../../enum/CategoriaLugar.js';
import type { EstadoValidacion } from '../../../enum/EstadoValidacion.js';
import type { NivelConfiabilidad } from '../../../enum/NivelConfiabilidad.js';
import type { NivelSaturacion } from '../../../enum/NivelSaturacion.js';
import type { Tier } from '../../../enum/Tier.js';
import type { TipoAccionValidacion } from '../../../enum/TipoAccionValidacion.js';

/** The reliability block shared by every M5 response. Counts are raw votes; `porcentaje` is 100 x confirmaciones / votos. */
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

/** The only thing shown about a report's author (C8): reports stay anonymous, so never their id, name or email. */
export interface AutorReporteDTO {
  /** Same values as `tier` of UsuarioResponseDTO, computed from the author's current points. */
  tier: Tier;
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
  autor: AutorReporteDTO;
}

/** data of GET /api/reportes/:id. Of the author only the tier is exposed (C8), never who they are. */
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
  autor: AutorReporteDTO;
}

/** The voter's points and tier after their vote (C7): the same values as `puntos` and `tier` of UsuarioResponseDTO. */
export interface PuntajeVotanteDTO {
  /** Integer >= 0, this vote included. */
  puntos: number;
  tier: Tier;
}

/** data of POST /api/reportes/:id/validaciones. */
export interface ValidacionCreadaResponseDTO {
  validacion: { id: number; reporteId: number; tipoAccion: TipoAccionValidacion; fechaHora: string };
  confiabilidad: ConfiabilidadDTO;
  estadoValidacion: EstadoValidacion;
  usuario: PuntajeVotanteDTO;
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
