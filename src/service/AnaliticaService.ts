import type { FiltroDias } from '../enum/FiltroDias.js';

export interface PuntoHistorial {
  /** YYYY-MM-DD (or YYYY-MM-DDTHH for hourly grouping) in the Lima time zone. */
  etiqueta: string;
  promedio: number;
  muestras: number;
}

export interface RangoFechas {
  /** YYYY-MM-DD, Lima time zone, inclusive. At most 31 days. */
  desde: string;
  hasta: string;
  dias: FiltroDias;
}

export interface MejorHorario {
  /** True when there are fewer than ANALITICA_MIN_MUESTRAS samples; the other fields are then empty. */
  datosInsuficientes: boolean;
  /** Top 3 hours (0..23) inside the opening hours, calmest first. */
  horas: number[];
}

/**
 * Pattern: Service layer. Historical analytics over ReporteDAO.agregarPorHora.
 * Owner: M4. In dev the demo seed (SEED_DEMO) provides the history and is declared as synthetic.
 */
export interface AnaliticaService {
  obtenerHistorial(lugarId: number, rango: RangoFechas): Promise<PuntoHistorial[]>;
  compararPeriodos(lugarId: number, periodoA: RangoFechas, periodoB: RangoFechas): Promise<{ a: PuntoHistorial[]; b: PuntoHistorial[] }>;
  obtenerMejorHorario(lugarId: number, dias: FiltroDias, semanas: number): Promise<MejorHorario>;
}
