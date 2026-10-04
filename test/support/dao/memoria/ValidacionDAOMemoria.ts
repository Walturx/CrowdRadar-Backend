import type { NuevaValidacion, ValidacionDAO } from '../../../../src/dao/ValidacionDAO.js';
import type { ValidacionReporte } from '../../../../src/entity/ValidacionReporte.js';
import { ConflictoException } from '../../../../src/exception/http/ConflictoException.js';

/** In-memory ValidacionDAO for tests; behaves like the Sequelize one (shared contract test). */
export class ValidacionDAOMemoria implements ValidacionDAO {
  private readonly filas: ValidacionReporte[] = [];

  async crear(datos: NuevaValidacion): Promise<ValidacionReporte> {
    if (this.filas.some((v) => v.reporteId === datos.reporteId && v.usuarioId === datos.usuarioId)) {
      throw new ConflictoException();
    }
    const ahora = new Date();
    const voto: ValidacionReporte = { ...datos, id: this.filas.length + 1, createdAt: ahora, updatedAt: ahora };
    this.filas.push(voto);
    return voto;
  }

  async buscarPorUsuarioYReporte(usuarioId: number, reporteId: number): Promise<ValidacionReporte | null> {
    return this.filas.find((v) => v.usuarioId === usuarioId && v.reporteId === reporteId) ?? null;
  }

  async listarVotos(reporteId: number): Promise<ValidacionReporte[]> {
    return this.filas
      .filter((v) => v.reporteId === reporteId)
      .sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime() || a.id - b.id);
  }
}
