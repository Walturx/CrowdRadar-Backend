import type {
  DatosPerfil,
  FiltroUsuarios,
  NuevoUsuario,
  OrdenUsuarios,
  UsuarioDAO,
} from '../../../../src/dao/UsuarioDAO.js';
import { armarPagina, desplazamiento, type Pagina, type Paginacion } from '../../../../src/dao/Paginacion.js';
import type { Usuario } from '../../../../src/entity/Usuario.js';
import { EstadoCuenta } from '../../../../src/enum/EstadoCuenta.js';
import { Rol } from '../../../../src/enum/Rol.js';
import { EmailYaRegistradoException } from '../../../../src/exception/usuario/EmailYaRegistradoException.js';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import { copia, sellosNuevos, type OpcionesMemoria } from './comun.js';

const comparadores: Record<OrdenUsuarios, (a: Usuario, b: Usuario) => number> = {
  RECIENTES: (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
  NOMBRE: (a, b) => a.nombre.localeCompare(b.nombre) || a.apellido.localeCompare(b.apellido) || a.id - b.id,
  KARMA: (a, b) => b.puntosKarma - a.puntosKarma || a.id - b.id,
};

/** In-memory UsuarioDAO for tests; behaves like the Sequelize one (shared contract test). */
export class UsuarioDAOMemoria implements UsuarioDAO {
  private readonly filas = new Map<number, Usuario>();
  private siguienteId = 1;
  private readonly reloj: Reloj;
  /** Error to throw from every call, to simulate a database outage. */
  fallo?: Error;

  constructor(opciones: OpcionesMemoria = {}) {
    this.reloj = opciones.reloj ?? relojSistema;
  }

  /** Seeds a ready-made entity (tests that need a specific id, role or status). */
  agregar(usuario: Usuario): Usuario {
    this.filas.set(usuario.id, copia(usuario));
    this.siguienteId = Math.max(this.siguienteId, usuario.id + 1);
    return copia(usuario);
  }

  private verificarFallo(): void {
    if (this.fallo) throw this.fallo;
  }

  async buscarPorId(id: number): Promise<Usuario | null> {
    this.verificarFallo();
    const usuario = this.filas.get(id);
    return usuario ? copia(usuario) : null;
  }

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    this.verificarFallo();
    const buscado = email.toLowerCase();
    const usuario = [...this.filas.values()].find((u) => u.email === buscado);
    return usuario ? copia(usuario) : null;
  }

  async crear(datos: NuevoUsuario): Promise<Usuario> {
    this.verificarFallo();
    const email = datos.email.toLowerCase();
    if ([...this.filas.values()].some((u) => u.email === email)) throw new EmailYaRegistradoException();
    const usuario: Usuario = copia({
      ...datos,
      email,
      id: this.siguienteId++,
      rol: Rol.USUARIO,
      status: EstadoCuenta.ACTIVO,
      puntosKarma: 0,
      passwordCambiadaEn: null,
      ...sellosNuevos(this.reloj),
    });
    this.filas.set(usuario.id, usuario);
    return copia(usuario);
  }

  async actualizarPerfil(id: number, datos: DatosPerfil): Promise<Usuario | null> {
    return this.modificar(id, datos);
  }

  async actualizarPasswordHash(id: number, passwordHash: string): Promise<boolean> {
    return (await this.modificar(id, { passwordHash, passwordCambiadaEn: this.reloj.ahora() })) !== null;
  }

  async actualizarStatus(id: number, status: EstadoCuenta): Promise<Usuario | null> {
    return this.modificar(id, { status });
  }

  async incrementarKarma(id: number, delta: number): Promise<number | null> {
    this.verificarFallo();
    const actual = this.filas.get(id);
    if (!actual) return null;
    const total = Math.max(actual.puntosKarma + delta, 0);
    return (await this.modificar(id, { puntosKarma: total }))?.puntosKarma ?? null;
  }

  async listar(filtro: FiltroUsuarios, paginacion: Paginacion): Promise<Pagina<Usuario>> {
    this.verificarFallo();
    const q = filtro.q?.toLowerCase();
    const coincidentes = [...this.filas.values()]
      .filter((u) => !filtro.status || u.status === filtro.status)
      .filter((u) => !q || [u.nombre, u.apellido, u.email].some((campo) => campo.toLowerCase().includes(q)))
      .sort(comparadores[filtro.orden ?? 'RECIENTES']);
    const desde = desplazamiento(paginacion);
    return armarPagina(copia(coincidentes.slice(desde, desde + paginacion.size)), coincidentes.length, paginacion);
  }

  private async modificar(id: number, cambios: Partial<Usuario>): Promise<Usuario | null> {
    this.verificarFallo();
    const actual = this.filas.get(id);
    if (!actual) return null;
    const definidos = Object.fromEntries(Object.entries(cambios).filter(([, valor]) => valor !== undefined));
    const nuevo = { ...actual, ...definidos, updatedAt: this.reloj.ahora() };
    this.filas.set(id, nuevo);
    return copia(nuevo);
  }
}
