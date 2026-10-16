import type { LugarDAO } from '../../dao/LugarDAO.js';
import type { AgregadoHora, ConsultaAgregada, ReporteDAO } from '../../dao/ReporteDAO.js';
import type { Lugar } from '../../entity/Lugar.js';
import { AgrupacionHistorial } from '../../enum/AgrupacionHistorial.js';
import { FiltroDias } from '../../enum/FiltroDias.js';
import { NivelSaturacion } from '../../enum/NivelSaturacion.js';
import { CodigoError } from '../../exception/CodigoError.js';
import { RecursoNoEncontradoException } from '../../exception/http/RecursoNoEncontradoException.js';
import { ValidacionException } from '../../exception/http/ValidacionException.js';
import { diaDe, diasEntre, inicioDelDiaDe, sumarDias } from '../../util/dia.js';
import type { Reloj } from '../../util/Reloj.js';
import type {
  AnaliticaService,
  ConsultaHistorial,
  DiferenciaHora,
  FranjaRecomendada,
  PeriodoComparacion,
  PuntoHistorial,
  PuntoHora,
  ResultadoComparacion,
  ResultadoHistorial,
  ResultadoMejorHorario,
} from '../AnaliticaService.js';

const HORAS_POR_DIA = 24;
const DIAS_POR_SEMANA = 7;
/** Longest range between `desde` and `hasta`. */
const MAXIMO_DIAS_RANGO = 31;
/** The daily history without dates covers a week: today and the six days before. */
const DIAS_ANTES_HISTORIAL_DIARIO = 6;
/** Smallest difference between periods worth naming in the summary. */
const UMBRAL_DIFERENCIA_NOTABLE = 0.3;
const MEJORES_HORAS = 3;
/** Opening hours assumed for a place that has none recorded. */
const APERTURA_POR_DEFECTO = 8;
const CIERRE_POR_DEFECTO = 22;

export interface DependenciasAnaliticaService {
  lugarDAO: LugarDAO;
  reporteDAO: ReporteDAO;
  reloj: Reloj;
  /** IANA zone the days and hours are read in (America/Lima). */
  zonaHoraria: string;
  /** Samples a period or an hour needs before it counts (ANALITICA_MIN_MUESTRAS). */
  minMuestras: number;
  umbralModerado: number;
  umbralSaturado: number;
}

/** Weighted accumulator: hourly averages are combined by their number of samples. */
interface Celda {
  suma: number;
  muestras: number;
}

const redondear = (valor: number) => Math.round(valor * 100) / 100;
const promedioDe = ({ suma, muestras }: Celda) => (muestras === 0 ? 0 : suma / muestras);

function acumular<K>(celdas: Map<K, Celda>, clave: K, { promedio, muestras }: AgregadoHora): void {
  const celda = celdas.get(clave) ?? { suma: 0, muestras: 0 };
  celda.suma += promedio * muestras;
  celda.muestras += muestras;
  celdas.set(clave, celda);
}

/** Hour of day -> weighted average over every day of the range. */
function porHoraDelDia(agregados: AgregadoHora[]): Map<number, Celda> {
  const celdas = new Map<number, Celda>();
  for (const a of agregados) acumular(celdas, a.hora, a);
  return celdas;
}

/** Calendar day -> weighted average of its hours. */
function porDia(agregados: AgregadoHora[]): Map<string, Celda> {
  const celdas = new Map<string, Celda>();
  for (const a of agregados) acumular(celdas, a.dia, a);
  return celdas;
}

const punto = (etiqueta: string, celda: Celda): PuntoHistorial => ({
  etiqueta,
  valor: redondear(promedioDe(celda)),
  muestras: celda.muestras,
});

const etiquetaHora = (hora: number) => `${String(hora).padStart(2, '0')}:00`;

/**
 * Pattern: Service layer. Reads the hourly aggregation of the reports and shapes history, comparison and best hour; the daily
 * history is derived from the hourly buckets. It never writes.
 */
export class AnaliticaServiceImpl implements AnaliticaService {
  constructor(private readonly deps: DependenciasAnaliticaService) {}

  async obtenerHistorial(lugarId: number, consulta: ConsultaHistorial): Promise<ResultadoHistorial> {
    await this.exigirLugar(lugarId);
    const diario = consulta.agrupacion === AgrupacionHistorial.DIA;
    const hasta = consulta.hasta ?? diaDe(this.deps.reloj.ahora(), this.deps.zonaHoraria);
    const desde = consulta.desde ?? (diario ? sumarDias(hasta, -DIAS_ANTES_HISTORIAL_DIARIO) : hasta);
    // Both dates given by the caller must span at least a day; the defaults may be a single day (today).
    this.validarRango(desde, hasta, consulta.desde !== undefined && consulta.hasta !== undefined);

    const ventana = this.ventana(lugarId, desde, hasta, FiltroDias.TODOS);
    const [agregados, sintetico] = await Promise.all([
      this.deps.reporteDAO.agregarPorHora(ventana),
      this.deps.reporteDAO.hayReportesSinteticos(ventana),
    ]);
    // The DAO answers by day then hour, so the days come out chronological; the hours of day are sorted here.
    const puntos = diario
      ? [...porDia(agregados)].map(([dia, celda]) => punto(dia, celda))
      : [...porHoraDelDia(agregados)].sort(([a], [b]) => a - b).map(([hora, celda]) => punto(etiquetaHora(hora), celda));
    return { hayDatos: puntos.length > 0, sintetico, puntos };
  }

  async compararPeriodos(lugarId: number, a: PeriodoComparacion, b: PeriodoComparacion): Promise<ResultadoComparacion> {
    await this.exigirLugar(lugarId);
    this.validarRango(a.desde, a.hasta, true);
    this.validarRango(b.desde, b.hasta, true);
    const ventanaA = this.ventana(lugarId, a.desde, a.hasta, a.dias);
    const ventanaB = this.ventana(lugarId, b.desde, b.hasta, b.dias);
    const { reporteDAO } = this.deps;
    const [aggA, aggB, sinteticoA, sinteticoB] = await Promise.all([
      reporteDAO.agregarPorHora(ventanaA),
      reporteDAO.agregarPorHora(ventanaB),
      reporteDAO.hayReportesSinteticos(ventanaA),
      reporteDAO.hayReportesSinteticos(ventanaB),
    ]);
    const celdasA = porHoraDelDia(aggA);
    const celdasB = porHoraDelDia(aggB);
    const muestrasA = aggA.reduce((total, x) => total + x.muestras, 0);
    const muestrasB = aggB.reduce((total, x) => total + x.muestras, 0);
    const suficiente = muestrasA >= this.deps.minMuestras && muestrasB >= this.deps.minMuestras;
    const diferencias = suficiente ? this.diferencias(celdasA, celdasB) : [];
    return {
      suficiente,
      sintetico: sinteticoA || sinteticoB,
      periodoA: this.franjasDelDia(celdasA),
      periodoB: this.franjasDelDia(celdasB),
      diferencias,
      bandaMayorAfluencia: bandaMayor(diferencias),
      diasB: b.dias,
    };
  }

  async obtenerMejorHorario(lugarId: number, dias: FiltroDias, semanas: number): Promise<ResultadoMejorHorario> {
    const lugar = await this.exigirLugar(lugarId);
    const hasta = diaDe(this.deps.reloj.ahora(), this.deps.zonaHoraria);
    const desde = sumarDias(hasta, -(semanas * DIAS_POR_SEMANA - 1));
    const ventana = this.ventana(lugarId, desde, hasta, dias);
    const { reporteDAO, minMuestras } = this.deps;
    const [agregados, sintetico] = await Promise.all([reporteDAO.agregarPorHora(ventana), reporteDAO.hayReportesSinteticos(ventana)]);
    const abierto = horarioDe(lugar);
    const recomendaciones: FranjaRecomendada[] = [...porHoraDelDia(agregados).entries()]
      .filter(([hora, celda]) => abierto(hora) && celda.muestras >= minMuestras)
      .map(([hora, celda]) => ({ hora, promedio: promedioDe(celda), muestras: celda.muestras }))
      .sort((x, y) => x.promedio - y.promedio || y.muestras - x.muestras || x.hora - y.hora)
      .slice(0, MEJORES_HORAS)
      .map(({ hora, promedio, muestras }) => ({
        horaInicio: hora,
        horaFin: hora + 1,
        nivel: this.nivelDe(promedio),
        promedio: redondear(promedio),
        muestras,
      }));
    return { hayDatos: recomendaciones.length > 0, sintetico, recomendaciones };
  }

  private async exigirLugar(lugarId: number): Promise<Lugar> {
    const lugar = await this.deps.lugarDAO.buscarPorId(lugarId);
    if (!lugar) throw new RecursoNoEncontradoException(CodigoError.LUGAR_NO_ENCONTRADO, 'Lugar no encontrado.');
    return lugar;
  }

  /** `desde` <= `hasta` by at most 31 days (and by at least one when `exigirUnDia`). */
  private validarRango(desde: string, hasta: string, exigirUnDia: boolean): void {
    const dias = diasEntre(desde, hasta);
    if (dias > MAXIMO_DIAS_RANGO || dias < (exigirUnDia ? 1 : 0)) {
      throw new ValidacionException(
        [],
        `El rango de fechas es inválido: "desde" debe ser anterior a "hasta" y abarcar como máximo ${MAXIMO_DIAS_RANGO} días.`,
        CodigoError.RANGO_FECHAS_INVALIDO,
      );
    }
  }

  /** Both end days included: [start of `desde`, start of the day after `hasta`). */
  private ventana(lugarId: number, desde: string, hasta: string, dias: FiltroDias): ConsultaAgregada {
    const { zonaHoraria } = this.deps;
    return {
      lugarId,
      desde: inicioDelDiaDe(desde, zonaHoraria),
      hasta: inicioDelDiaDe(sumarDias(hasta, 1), zonaHoraria),
      dias,
      zonaHoraria,
    };
  }

  private franjasDelDia(celdas: Map<number, Celda>): PuntoHora[] {
    return Array.from({ length: HORAS_POR_DIA }, (_, hora) => {
      const celda = celdas.get(hora) ?? { suma: 0, muestras: 0 };
      return { hora, valor: redondear(promedioDe(celda)), muestras: celda.muestras };
    });
  }

  /** B minus A, only for the hours both periods have reports in. */
  private diferencias(celdasA: Map<number, Celda>, celdasB: Map<number, Celda>): DiferenciaHora[] {
    const diferencias: DiferenciaHora[] = [];
    for (let hora = 0; hora < HORAS_POR_DIA; hora += 1) {
      const a = celdasA.get(hora);
      const b = celdasB.get(hora);
      if (a && b) diferencias.push({ hora, diferencia: redondear(promedioDe(b) - promedioDe(a)) });
    }
    return diferencias;
  }

  private nivelDe(promedio: number): NivelSaturacion {
    if (promedio < this.deps.umbralModerado) return NivelSaturacion.TRANQUILO;
    return promedio < this.deps.umbralSaturado ? NivelSaturacion.MODERADO : NivelSaturacion.SATURADO;
  }
}

/** Whether an hour of day lies inside the opening hours; a closing hour before the opening one crosses midnight. */
function horarioDe(lugar: Lugar): (hora: number) => boolean {
  const apertura = lugar.horaApertura ?? APERTURA_POR_DEFECTO;
  const cierre = lugar.horaCierre ?? CIERRE_POR_DEFECTO;
  return apertura < cierre ? (hora) => hora >= apertura && hora < cierre : (hora) => hora >= apertura || hora < cierre;
}

/** The run of consecutive notable hours around the largest difference, or null when none is notable. */
function bandaMayor(diferencias: DiferenciaHora[]): ResultadoComparacion['bandaMayorAfluencia'] {
  const notable = (hora: number) => (diferencias.find((d) => d.hora === hora)?.diferencia ?? 0) >= UMBRAL_DIFERENCIA_NOTABLE;
  const mayor = diferencias.reduce<DiferenciaHora | undefined>((m, d) => (!m || d.diferencia > m.diferencia ? d : m), undefined);
  if (!mayor || mayor.diferencia < UMBRAL_DIFERENCIA_NOTABLE) return null;
  let inicio = mayor.hora;
  let fin = mayor.hora;
  while (notable(inicio - 1)) inicio -= 1;
  while (notable(fin + 1)) fin += 1;
  return { horaInicio: inicio, horaFin: fin + 1 };
}
