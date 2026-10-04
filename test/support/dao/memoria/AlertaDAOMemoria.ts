import type { AlertaDAO, NuevaAlerta } from '../../../../src/dao/AlertaDAO.js';
import { armarPagina, desplazamiento, type Pagina, type Paginacion } from '../../../../src/dao/Paginacion.js';
import type { Alerta } from '../../../../src/entity/Alerta.js';

/** In-memory AlertaDAO for tests; behaves like the Sequelize one (shared contract test). */
export class AlertaDAOMemoria implements AlertaDAO {
  private readonly filas: Alerta[] = [];

  async crear(datos: NuevaAlerta): Promise<Alerta> {
    const ahora = new Date();
    const alerta: Alerta = { ...datos, id: this.filas.length + 1, leida: false, createdAt: ahora, updatedAt: ahora };
    this.filas.push(alerta);
    return alerta;
  }

  async listarPorUsuario(usuarioId: number, paginacion: Paginacion): Promise<Pagina<Alerta>> {
    const propias = this.filas
      .filter((a) => a.usuarioId === usuarioId)
      .sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime() || b.id - a.id);
    const desde = desplazamiento(paginacion);
    return armarPagina(propias.slice(desde, desde + paginacion.size), propias.length, paginacion);
  }

  async marcarLeida(id: number, usuarioId: number): Promise<Alerta | null> {
    const alerta = this.filas.find((a) => a.id === id && a.usuarioId === usuarioId);
    if (!alerta) return null;
    Object.assign(alerta, { leida: true, updatedAt: new Date() });
    return alerta;
  }

  async contarNoLeidas(usuarioId: number): Promise<number> {
    return this.filas.filter((a) => a.usuarioId === usuarioId && !a.leida).length;
  }
}
