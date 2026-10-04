import type { AlertaDAO, NuevaAlerta } from '../../../../src/dao/AlertaDAO.js';
import { armarPagina, desplazamiento, type Pagina, type Paginacion } from '../../../../src/dao/Paginacion.js';
import type { Alerta } from '../../../../src/entity/Alerta.js';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import { copia, exigirReferencia, sellosNuevos, type OpcionesMemoria } from './comun.js';
import type { SembradorMemoria } from './SembradorMemoria.js';

/** In-memory AlertaDAO for tests; behaves like the Sequelize one (shared contract test). */
export class AlertaDAOMemoria implements AlertaDAO {
  private filas: Alerta[] = [];
  private siguienteId = 1;
  private readonly reloj: Reloj;
  private readonly sembrador?: SembradorMemoria;

  constructor(opciones: OpcionesMemoria = {}) {
    this.reloj = opciones.reloj ?? relojSistema;
    this.sembrador = opciones.sembrador;
  }

  async crear(datos: NuevaAlerta): Promise<Alerta> {
    exigirReferencia(this.sembrador, 'favorito', 'favorito_id', datos.favoritoId, 'alerta');
    exigirReferencia(this.sembrador, 'usuario', 'usuario_id', datos.usuarioId, 'alerta');
    exigirReferencia(this.sembrador, 'lugar', 'lugar_id', datos.lugarId, 'alerta');
    const alerta: Alerta = copia({ ...datos, id: this.siguienteId++, leida: false, ...sellosNuevos(this.reloj) });
    this.filas.push(alerta);
    return copia(alerta);
  }

  async listarPorUsuario(usuarioId: number, paginacion: Paginacion): Promise<Pagina<Alerta>> {
    const propias = this.filas
      .filter((a) => a.usuarioId === usuarioId)
      .sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime() || b.id - a.id);
    const desde = desplazamiento(paginacion);
    return armarPagina(copia(propias.slice(desde, desde + paginacion.size)), propias.length, paginacion);
  }

  async marcarLeida(id: number, usuarioId: number): Promise<Alerta | null> {
    const alerta = this.filas.find((a) => a.id === id && a.usuarioId === usuarioId);
    if (!alerta) return null;
    Object.assign(alerta, { leida: true, updatedAt: this.reloj.ahora() });
    return copia(alerta);
  }

  async contarNoLeidas(usuarioId: number): Promise<number> {
    return this.filas.filter((a) => a.usuarioId === usuarioId && !a.leida).length;
  }

  /** Mirrors `ON DELETE CASCADE` from `lugar_favorito`: FavoritoDAOMemoria calls it when a favourite is removed. */
  eliminarDeFavorito(favoritoId: number): number {
    const antes = this.filas.length;
    this.filas = this.filas.filter((a) => a.favoritoId !== favoritoId);
    return antes - this.filas.length;
  }
}
