import type { ContextoTx } from '../datasource/ConexionBD.js';
import type { Denuncia } from '../entity/Denuncia.js';
import type { EstadoDenuncia } from '../enum/EstadoDenuncia.js';
import type { MotivoDenuncia } from '../enum/MotivoDenuncia.js';
import type { Pagina, Paginacion } from './Paginacion.js';

export interface NuevaDenuncia {
  reporteId: number;
  usuarioId: number;
  motivo: MotivoDenuncia;
  /** Required when `motivo` is OTRO (ck_denuncia_detalle_otro). */
  detalle: string | null;
  fechaHora: Date;
}

/** A report with complaints awaiting a decision. */
export interface ReporteDenunciado {
  reporteId: number;
  pendientes: number;
  ultimaDenunciaEn: Date;
}

export interface ResumenMotivo {
  motivo: MotivoDenuncia;
  total: number;
}

/**
 * Pattern: DAO (port). Persistence contract for `denuncia`. Owner: M5 (creates), consumed by
 * M6 (resolves). `crear` throws ConflictoException when the user already complained about
 * the report (the service maps it to DENUNCIA_DUPLICADA).
 */
export interface DenunciaDAO {
  crear(datos: NuevaDenuncia, tx?: ContextoTx): Promise<Denuncia>;
  existe(usuarioId: number, reporteId: number, tx?: ContextoTx): Promise<boolean>;
  /** Reports with PENDIENTE complaints: most pending first, then most recent complaint first. */
  listarReportesConPendientes(paginacion: Paginacion, tx?: ContextoTx): Promise<Pagina<ReporteDenunciado>>;
  /** PENDIENTE complaints of the report grouped by reason. */
  resumirMotivos(reporteId: number, tx?: ContextoTx): Promise<ResumenMotivo[]>;
  /** Sets the decision on every PENDIENTE complaint of the report; returns how many changed. */
  resolverPendientes(
    reporteId: number,
    estado: EstadoDenuncia,
    resueltaPor: number,
    resueltaEn: Date,
    tx?: ContextoTx,
  ): Promise<number>;
  /** Complaints (any state) against reports written by the user. */
  contarRecibidasPorAutor(autorId: number, tx?: ContextoTx): Promise<number>;
}
