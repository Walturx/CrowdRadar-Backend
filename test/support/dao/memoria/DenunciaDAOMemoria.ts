import type { NuevaDenuncia, DenunciaDAO, ReporteDenunciado, ResumenMotivo } from '../../../../src/dao/DenunciaDAO.js';
import { armarPagina, desplazamiento, type Pagina, type Paginacion } from '../../../../src/dao/Paginacion.js';
import type { Denuncia } from '../../../../src/entity/Denuncia.js';
import { EstadoDenuncia } from '../../../../src/enum/EstadoDenuncia.js';
import { ConflictoException } from '../../../../src/exception/http/ConflictoException.js';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import { copia, sellosNuevos, type OpcionesMemoria } from './comun.js';

export interface OpcionesDenunciaMemoria extends OpcionesMemoria {
  /** Resolves the author of a report, which the real DAO obtains with a join (defaults to `sembrador.autorDe`). */
  autorDe?: (reporteId: number) => number | undefined;
}

/** In-memory DenunciaDAO for tests; behaves like the Sequelize one (shared contract test). */
export class DenunciaDAOMemoria implements DenunciaDAO {
  private readonly filas: Denuncia[] = [];
  private siguienteId = 1;
  private readonly reloj: Reloj;
  private readonly autorDe: (reporteId: number) => number | undefined;

  constructor(opciones: OpcionesDenunciaMemoria = {}) {
    this.reloj = opciones.reloj ?? relojSistema;
    this.autorDe = opciones.autorDe ?? ((reporteId) => opciones.sembrador?.autorDe(reporteId));
  }

  async crear(datos: NuevaDenuncia): Promise<Denuncia> {
    if (await this.existe(datos.usuarioId, datos.reporteId)) throw new ConflictoException();
    const denuncia: Denuncia = copia({
      ...datos,
      id: this.siguienteId++,
      estado: EstadoDenuncia.PENDIENTE,
      resueltaPor: null,
      resueltaEn: null,
      ...sellosNuevos(this.reloj),
    });
    this.filas.push(denuncia);
    return copia(denuncia);
  }

  async existe(usuarioId: number, reporteId: number): Promise<boolean> {
    return this.filas.some((d) => d.usuarioId === usuarioId && d.reporteId === reporteId);
  }

  async listarReportesConPendientes(paginacion: Paginacion): Promise<Pagina<ReporteDenunciado>> {
    const porReporte = new Map<number, ReporteDenunciado>();
    for (const d of this.pendientes()) {
      const actual = porReporte.get(d.reporteId);
      porReporte.set(d.reporteId, {
        reporteId: d.reporteId,
        pendientes: (actual?.pendientes ?? 0) + 1,
        ultimaDenunciaEn: actual && actual.ultimaDenunciaEn > d.fechaHora ? actual.ultimaDenunciaEn : d.fechaHora,
      });
    }
    const ordenados = [...porReporte.values()].sort(
      (a, b) =>
        b.pendientes - a.pendientes ||
        b.ultimaDenunciaEn.getTime() - a.ultimaDenunciaEn.getTime() ||
        b.reporteId - a.reporteId,
    );
    const desde = desplazamiento(paginacion);
    return armarPagina(copia(ordenados.slice(desde, desde + paginacion.size)), ordenados.length, paginacion);
  }

  async resumirMotivos(reporteId: number): Promise<ResumenMotivo[]> {
    const totales = new Map<ResumenMotivo['motivo'], number>();
    for (const d of this.pendientes().filter((x) => x.reporteId === reporteId)) {
      totales.set(d.motivo, (totales.get(d.motivo) ?? 0) + 1);
    }
    return [...totales].map(([motivo, total]) => ({ motivo, total }));
  }

  async resolverPendientes(reporteId: number, estado: EstadoDenuncia, resueltaPor: number, resueltaEn: Date) {
    const objetivo = this.pendientes().filter((d) => d.reporteId === reporteId);
    for (const d of objetivo) {
      Object.assign(d, { estado, resueltaPor, resueltaEn: new Date(resueltaEn), updatedAt: this.reloj.ahora() });
    }
    return objetivo.length;
  }

  async contarRecibidasPorAutor(autorId: number): Promise<number> {
    return this.filas.filter((d) => this.autorDe(d.reporteId) === autorId).length;
  }

  private pendientes(): Denuncia[] {
    return this.filas.filter((d) => d.estado === EstadoDenuncia.PENDIENTE);
  }
}
