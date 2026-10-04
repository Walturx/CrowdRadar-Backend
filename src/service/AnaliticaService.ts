import type { AgrupacionHistorial } from '../enum/AgrupacionHistorial.js';
import type { FiltroDias } from '../enum/FiltroDias.js';

export interface ConsultaHistorial {
  agrupacion: AgrupacionHistorial;
  /** YYYY-MM-DD, Lima calendar day, inclusive. Defaults: `hasta` is today; `desde` is `hasta` by hour and 6 days before it by day. */
  desde?: string;
  hasta?: string;
}

/** One period of a comparison: calendar days (YYYY-MM-DD, Lima, inclusive) and the day filter. */
export interface PeriodoComparacion {
  desde: string;
  hasta: string;
  dias: FiltroDias;
}

/** Average level (1..3) of the reports of a slot. `etiqueta` is `HH:00` by hour and YYYY-MM-DD by day. */
export interface PuntoHistorial {
  etiqueta: string;
  valor: number;
  muestras: number;
}

export interface ResultadoHistorial {
  hayDatos: boolean;
  /** True when some report of the range comes from a demo user. */
  sintetico: boolean;
  puntos: PuntoHistorial[];
}

/** One of the 24 hours of a period; `valor` is 0 when the hour has no reports. */
export interface PuntoHora {
  hora: number;
  valor: number;
  muestras: number;
}

export interface DiferenciaHora {
  hora: number;
  /** Period B minus period A: positive when B is busier. */
  diferencia: number;
}

export interface ResultadoComparacion {
  /** False when either period has fewer samples than ANALITICA_MIN_MUESTRAS; the differences are then empty. */
  suficiente: boolean;
  sintetico: boolean;
  periodoA: PuntoHora[];
  periodoB: PuntoHora[];
  diferencias: DiferenciaHora[];
  /** The run of hours where B is notably busier than A around the largest difference; `horaFin` is exclusive. */
  bandaMayorAfluencia: { horaInicio: number; horaFin: number } | null;
  diasB: FiltroDias;
}

/**
 * Pattern: Service layer. Historical analytics over ReporteDAO.agregarPorHora; the day aggregation is computed here from the
 * hourly one. Owner: M4. Throws RecursoNoEncontradoException (LUGAR_NO_ENCONTRADO) and a 400 RANGO_FECHAS_INVALIDO when a
 * range is not 1..31 days. The demo seed (SEED_SINTETICO) provides the history in dev and is declared as synthetic.
 */
export interface AnaliticaService {
  obtenerHistorial(lugarId: number, consulta: ConsultaHistorial): Promise<ResultadoHistorial>;
  compararPeriodos(lugarId: number, periodoA: PeriodoComparacion, periodoB: PeriodoComparacion): Promise<ResultadoComparacion>;
}
