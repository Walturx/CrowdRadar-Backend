import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { ReporteSaturacion } from '../entity/ReporteSaturacion.js';
import type { EstadoReporte } from '../enum/EstadoReporte.js';
import type { FiltroDias } from '../enum/FiltroDias.js';
import type { MotivoSinPuntos } from '../enum/MotivoSinPuntos.js';
import type { NivelSaturacion } from '../enum/NivelSaturacion.js';
import type { Pagina, Paginacion } from './Paginacion.js';

export interface NuevoReporte {
  usuarioId: number;
  lugarId: number;
  nivelSaturacion: NivelSaturacion;
  /** Taken from the injected Reloj so tests control time. */
  fechaHora: Date;
}

/** Hourly aggregation request (M4 analytics). Reports are ACTIVO only, level mapped TRANQUILO 1, MODERADO 2, SATURADO 3. */
export interface ConsultaAgregada {
  lugarId: number;
  /** Inclusive. */
  desde: Date;
  /** Exclusive. */
  hasta: Date;
  dias: FiltroDias;
  /** IANA zone used to bucket by day and hour and to apply `dias` (America/Lima). */
  zonaHoraria: string;
}

/** Average level of the reports of one place-hour: `dia` is YYYY-MM-DD and `hora` 0..23 in the query zone. */
export interface AgregadoHora {
  dia: string;
  hora: number;
  promedio: number;
  muestras: number;
}

/** Reports a user may vote on (M5): other people's ACTIVO reports from `desde` on, optionally within some places. */
export interface FiltroPendientes {
  /** The voter: their own reports are excluded. */
  usuarioId: number;
  desde: Date;
  lugarIds?: readonly number[];
}

/**
 * Pattern: DAO (port). Persistence contract for `reporte_saturacion`. Owner: M4, except
 * `listarPendientesDeValidar` and `actualizarConfiabilidad`, which M5 completes inside the
 * same class. M2 consumes `contarPorLugarDesde`. Lists are newest first.
 */
export interface ReporteDAO {
  /** Inserts an ACTIVO report with no points and no reliability. */
  crear(datos: NuevoReporte, tx?: ContextoTx): Promise<ReporteSaturacion>;
  buscarPorId(id: number, tx?: ContextoTx): Promise<ReporteSaturacion | null>;
  /**
   * Latest report (any estado) of the user at the place, for the cooldown check. The Sequelize
   * impl must take pg_advisory_xact_lock(usuarioId, lugarId) here so check and insert serialize.
   */
  buscarUltimoDeUsuarioEnLugar(usuarioId: number, lugarId: number, tx?: ContextoTx): Promise<ReporteSaturacion | null>;
  /** Reports of the place with fechaHora >= desde, ANY estado (the strategy discards ELIMINADO). */
  listarRecientesPorLugar(lugarId: number, desde: Date, tx?: ContextoTx): Promise<ReporteSaturacion[]>;
  /** ACTIVO reports of the place with fechaHora >= desde. */
  contarPorLugarDesde(lugarId: number, desde: Date, tx?: ContextoTx): Promise<number>;
  /** Reports of the user with puntosOtorgados > 0 and fechaHora >= desde (daily karma cap). */
  contarPremiadosDeUsuarioDesde(usuarioId: number, desde: Date, tx?: ContextoTx): Promise<number>;
  /** Stores the points a report earned and why it earned none; null when the report does not exist. */
  registrarPuntos(
    reporteId: number,
    puntos: number,
    motivo: MotivoSinPuntos | null,
    tx?: ContextoTx,
  ): Promise<ReporteSaturacion | null>;
  listarPorUsuario(usuarioId: number, paginacion: Paginacion, tx?: ContextoTx): Promise<Pagina<ReporteSaturacion>>;
  actualizarEstado(id: number, estado: EstadoReporte, tx?: ContextoTx): Promise<ReporteSaturacion | null>;
  /** 0..100; null return when the report does not exist (M5). */
  actualizarConfiabilidad(id: number, nivel: number, tx?: ContextoTx): Promise<ReporteSaturacion | null>;
  /** Buckets by (day, hour) in the query zone, ordered by day then hour; empty buckets are omitted. */
  agregarPorHora(consulta: ConsultaAgregada, tx?: ContextoTx): Promise<AgregadoHora[]>;
  listarPendientesDeValidar(
    filtro: FiltroPendientes,
    paginacion: Paginacion,
    tx?: ContextoTx,
  ): Promise<Pagina<ReporteSaturacion>>;
}
