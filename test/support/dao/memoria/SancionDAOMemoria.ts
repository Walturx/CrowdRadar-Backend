import type { NuevaSancion, SancionDAO } from '../../../../src/dao/SancionDAO.js';
import { TipoSancion } from '../../../../src/enum/TipoSancion.js';
import type { SancionUsuario } from '../../../../src/entity/SancionUsuario.js';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import { copia, exigirReferencia, sellosNuevos, type OpcionesMemoria } from './comun.js';
import type { SembradorMemoria } from './SembradorMemoria.js';

/** In-memory SancionDAO for tests; behaves like the Sequelize one (shared contract test). */
export class SancionDAOMemoria implements SancionDAO {
  private readonly filas: SancionUsuario[] = [];
  private siguienteId = 1;
  private readonly reloj: Reloj;
  private readonly sembrador?: SembradorMemoria;

  constructor(opciones: OpcionesMemoria = {}) {
    this.reloj = opciones.reloj ?? relojSistema;
    this.sembrador = opciones.sembrador;
  }

  async crear(datos: NuevaSancion): Promise<SancionUsuario> {
    exigirReferencia(this.sembrador, 'usuario', 'usuario_id', datos.usuarioId, 'sancion_usuario');
    exigirReferencia(this.sembrador, 'usuario', 'administrador_id', datos.administradorId, 'sancion_usuario');
    const sancion: SancionUsuario = copia({
      ...datos,
      id: this.siguienteId++,
      tipo: TipoSancion.SUSPENSION_TEMPORAL,
      fechaLevantamiento: null,
      levantadaPor: null,
      ...sellosNuevos(this.reloj),
    });
    this.filas.push(sancion);
    return copia(sancion);
  }

  async buscarVigente(usuarioId: number, ahora: Date): Promise<SancionUsuario | null> {
    const vigente = this.filas
      .filter((s) => s.usuarioId === usuarioId && s.fechaLevantamiento === null && s.fechaFin > ahora)
      .sort((a, b) => b.fechaInicio.getTime() - a.fechaInicio.getTime() || b.id - a.id)[0];
    return vigente ? copia(vigente) : null;
  }

  async levantar(id: number, levantadaPor: number, fecha: Date): Promise<SancionUsuario | null> {
    const sancion = this.filas.find((s) => s.id === id);
    if (!sancion) return null;
    Object.assign(sancion, { fechaLevantamiento: new Date(fecha), levantadaPor, updatedAt: this.reloj.ahora() });
    return copia(sancion);
  }
}
