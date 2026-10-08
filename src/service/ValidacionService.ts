import type { Pagina, Paginacion } from '../dao/Paginacion.js';
import type { Lugar } from '../entity/Lugar.js';
import type { ReporteSaturacion } from '../entity/ReporteSaturacion.js';
import type { ValidacionReporte } from '../entity/ValidacionReporte.js';
import type { EstadoValidacion } from '../enum/EstadoValidacion.js';
import type { TipoAccionValidacion } from '../enum/TipoAccionValidacion.js';
import type { ResultadoConfiabilidad } from '../pattern/strategy/confiabilidad/EstrategiaConfiabilidad.js';

export interface ConsultaPendientes {
  lat: number;
  lng: number;
  /** Default RADIO_PENDIENTES_KM. */
  radioKm: number;
  /** 1..24, default VENTANA_PENDIENTES_HORAS. */
  horas: number;
  page: number;
  size: number;
}

/** A report's reliability, its raw (unweighted) vote counts and the validation progress derived from them. */
export interface ConfiabilidadReporte extends ResultadoConfiabilidad {
  confirmaciones: number;
  rechazos: number;
  estado: EstadoValidacion;
}

/** A report the caller may vote on, with its place and how far the place is from the caller. */
export interface ReportePendiente {
  reporte: ReporteSaturacion;
  lugar: Lugar;
  distanciaMetros: number;
  confiabilidad: ConfiabilidadReporte;
}

/** What the caller sees of a report: reliability plus what they already did with it. */
export interface DetalleReporte {
  reporte: ReporteSaturacion;
  lugar: Lugar;
  confiabilidad: ConfiabilidadReporte;
  miValidacion: TipoAccionValidacion | null;
  yaDenunciado: boolean;
  esPropio: boolean;
}

export interface ResultadoValidacion {
  validacion: ValidacionReporte;
  karma: { puntosGanados: number; total: number };
  /** Recomputed with the new vote included. */
  confiabilidad: ConfiabilidadReporte;
}

/** One of the caller's own reports with how its validation is going (HU 5.3). */
export interface EstadoMiReporte {
  reporte: ReporteSaturacion;
  lugarNombre: string;
  confiabilidad: ConfiabilidadReporte;
}

/**
 * Pattern: Service layer + Strategy (context for EstrategiaConfiabilidad). Voting on other people's reports.
 * Owner: M5. Throws ReporteNoEncontradoException (404), AutovalidacionException (422) and
 * ValidacionDuplicadaException (409). `validar` runs in one transaction: vote, +KARMA_POR_VALIDACION, recompute
 * reliability and store it.
 */
export interface ValidacionService {
  /** ACTIVO reports of other users in the radius and time window the caller has not voted on: nearest place first, then newest. */
  listarPendientes(usuarioId: number, consulta: ConsultaPendientes): Promise<Pagina<ReportePendiente>>;
  obtenerReporte(usuarioId: number, reporteId: number): Promise<DetalleReporte>;
  consultarConfiabilidad(reporteId: number): Promise<ConfiabilidadReporte>;
  validar(usuarioId: number, reporteId: number, tipoAccion: TipoAccionValidacion): Promise<ResultadoValidacion>;
  /** The caller's reports, newest first, each with its reliability and derived state. */
  consultarEstadoMisReportes(usuarioId: number, paginacion: Paginacion): Promise<Pagina<EstadoMiReporte>>;
}
