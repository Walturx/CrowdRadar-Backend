import type { NuevaSancion, SancionDAO } from '../../../../src/dao/SancionDAO.js';
import type { SancionUsuario } from '../../../../src/entity/SancionUsuario.js';

/** In-memory SancionDAO for tests; behaves like the Sequelize one (shared contract test). */
export class SancionDAOMemoria implements SancionDAO {
  private readonly filas: SancionUsuario[] = [];

  async crear(datos: NuevaSancion): Promise<SancionUsuario> {
    const ahora = new Date();
    const sancion: SancionUsuario = {
      ...datos,
      id: this.filas.length + 1,
      tipo: 'SUSPENSION_TEMPORAL',
      fechaLevantamiento: null,
      levantadaPor: null,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.filas.push(sancion);
    return sancion;
  }

  async buscarVigente(usuarioId: number, ahora: Date): Promise<SancionUsuario | null> {
    return (
      this.filas
        .filter((s) => s.usuarioId === usuarioId && s.fechaLevantamiento === null && s.fechaFin > ahora)
        .sort((a, b) => b.fechaInicio.getTime() - a.fechaInicio.getTime() || b.id - a.id)[0] ?? null
    );
  }

  async levantar(id: number, levantadaPor: number, fecha: Date): Promise<SancionUsuario | null> {
    const sancion = this.filas.find((s) => s.id === id);
    if (!sancion) return null;
    Object.assign(sancion, { fechaLevantamiento: fecha, levantadaPor, updatedAt: new Date() });
    return sancion;
  }
}
