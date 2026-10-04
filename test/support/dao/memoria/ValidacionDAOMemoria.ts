import type { NuevaValidacion, ValidacionDAO } from '../../../../src/dao/ValidacionDAO.js';
import type { ValidacionReporte } from '../../../../src/entity/ValidacionReporte.js';
import { ConflictoException } from '../../../../src/exception/http/ConflictoException.js';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import { copia, sellosNuevos, type OpcionesMemoria } from './comun.js';

/** In-memory ValidacionDAO for tests; behaves like the Sequelize one (shared contract test). */
export class ValidacionDAOMemoria implements ValidacionDAO {
  private readonly filas: ValidacionReporte[] = [];
  private siguienteId = 1;
  private readonly reloj: Reloj;

  constructor(opciones: OpcionesMemoria = {}) {
    this.reloj = opciones.reloj ?? relojSistema;
  }

  async crear(datos: NuevaValidacion): Promise<ValidacionReporte> {
    if (this.filas.some((v) => v.reporteId === datos.reporteId && v.usuarioId === datos.usuarioId)) {
      throw new ConflictoException();
    }
    const voto: ValidacionReporte = copia({ ...datos, id: this.siguienteId++, ...sellosNuevos(this.reloj) });
    this.filas.push(voto);
    return copia(voto);
  }

  async buscarPorUsuarioYReporte(usuarioId: number, reporteId: number): Promise<ValidacionReporte | null> {
    const voto = this.filas.find((v) => v.usuarioId === usuarioId && v.reporteId === reporteId);
    return voto ? copia(voto) : null;
  }

  async listarVotos(reporteId: number): Promise<ValidacionReporte[]> {
    return copia(
      this.filas
        .filter((v) => v.reporteId === reporteId)
        .sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime() || a.id - b.id),
    );
  }
}
