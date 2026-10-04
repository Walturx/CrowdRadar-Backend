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

export interface EstadoMiReporte {
  reporteId: number;
  estado: EstadoValidacion;
  confiabilidad: ResultadoConfiabilidad;
}

/**
 * Pattern: Service layer + Strategy (context for EstrategiaConfiabilidad). Voting on other people's reports.
 * Owner: M5. Throws AutovalidacionException (422) and ValidacionDuplicadaException (409).
 * `validar` runs in one transaction: vote, +KARMA_POR_VALIDACION, recompute reliability and store it.
 */
export interface ValidacionService {
  consultarConfiabilidad(reporteId: number): Promise<ResultadoConfiabilidad>;
  validar(usuarioId: number, reporteId: number, tipoAccion: TipoAccionValidacion): Promise<ValidacionReporte>;
  consultarEstadoMisReportes(usuarioId: number): Promise<EstadoMiReporte[]>;
}
