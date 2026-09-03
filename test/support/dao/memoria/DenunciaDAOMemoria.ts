import type { NuevaDenuncia, DenunciaDAO, ReporteDenunciado, ResumenMotivo } from '../../../../src/dao/DenunciaDAO.js';
import { armarPagina, desplazamiento, type Pagina, type Paginacion } from '../../../../src/dao/Paginacion.js';
import type { Denuncia } from '../../../../src/entity/Denuncia.js';
import { EstadoDenuncia } from '../../../../src/enum/EstadoDenuncia.js';
import { ConflictoException } from '../../../../src/exception/http/ConflictoException.js';

/**
 * In-memory DenunciaDAO for tests; behaves like the Sequelize one (shared contract test).
 * `autorDe` resolves the author of a report, which the real DAO obtains with a join.
 */
export class DenunciaDAOMemoria implements DenunciaDAO {
  private readonly filas: Denuncia[] = [];

  constructor(private readonly autorDe: (reporteId: number) => number | undefined = () => undefined) {}

  async crear(datos: NuevaDenuncia): Promise<Denuncia> {
    if (await this.existe(datos.usuarioId, datos.reporteId)) throw new ConflictoException();
    const ahora = new Date();
    const denuncia: Denuncia = {
      ...datos,
      id: this.filas.length + 1,
      estado: EstadoDenuncia.PENDIENTE,
      resueltaPor: null,
      resueltaEn: null,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.filas.push(denuncia);
    return denuncia;
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
      (a, b) => b.pendientes - a.pendientes || b.ultimaDenunciaEn.getTime() - a.ultimaDenunciaEn.getTime(),
    );
    const desde = desplazamiento(paginacion);
    return armarPagina(ordenados.slice(desde, desde + paginacion.size), ordenados.length, paginacion);
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
      Object.assign(d, { estado, resueltaPor, resueltaEn, updatedAt: new Date() });
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
