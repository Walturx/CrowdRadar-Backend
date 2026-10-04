import { armarPagina, desplazamiento, type Pagina, type Paginacion } from '../../../../src/dao/Paginacion.js';
import type {
  AgregadoHora,
  ConsultaAgregada,
  FiltroPendientes,
  NuevoReporte,
  ReporteDAO,
} from '../../../../src/dao/ReporteDAO.js';
import type { ReporteSaturacion } from '../../../../src/entity/ReporteSaturacion.js';
import { EstadoReporte } from '../../../../src/enum/EstadoReporte.js';
import { FiltroDias } from '../../../../src/enum/FiltroDias.js';
import type { MotivoSinPuntos } from '../../../../src/enum/MotivoSinPuntos.js';
import { NivelSaturacion } from '../../../../src/enum/NivelSaturacion.js';

const VALOR: Record<NivelSaturacion, number> = { TRANQUILO: 1, MODERADO: 2, SATURADO: 3 };
const masNuevoPrimero = (a: ReporteSaturacion, b: ReporteSaturacion) =>
  b.fechaHora.getTime() - a.fechaHora.getTime() || b.id - a.id;

/** Calendar day (YYYY-MM-DD), hour and weekday of an instant in an IANA zone. */
function enZona(fecha: Date, zona: string): { dia: string; hora: number; finDeSemana: boolean } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      weekday: 'short',
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value]),
  );
  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    hora: Number(partes.hour),
    finDeSemana: partes.weekday === 'Sat' || partes.weekday === 'Sun',
  };
}

/** In-memory ReporteDAO for tests; behaves like the Sequelize one (shared contract test). */
export class ReporteDAOMemoria implements ReporteDAO {
  private readonly filas = new Map<number, ReporteSaturacion>();
  private siguienteId = 1;

  /** Seeds a ready-made entity (tests that need specific ids or states). */
  agregar(reporte: ReporteSaturacion): ReporteSaturacion {
    this.filas.set(reporte.id, reporte);
    this.siguienteId = Math.max(this.siguienteId, reporte.id + 1);
    return reporte;
  }

  async crear(datos: NuevoReporte): Promise<ReporteSaturacion> {
    const ahora = new Date();
    return this.agregar({
      ...datos,
      id: this.siguienteId,
      nivelConfiabilidad: null,
      estado: EstadoReporte.ACTIVO,
      puntosOtorgados: 0,
      motivoSinPuntos: null,
      createdAt: ahora,
      updatedAt: ahora,
    });
  }

  async buscarPorId(id: number): Promise<ReporteSaturacion | null> {
    return this.filas.get(id) ?? null;
  }

  async buscarUltimoDeUsuarioEnLugar(usuarioId: number, lugarId: number): Promise<ReporteSaturacion | null> {
    return (
      this.todos()
        .filter((r) => r.usuarioId === usuarioId && r.lugarId === lugarId)
        .sort(masNuevoPrimero)[0] ?? null
    );
  }

  async listarRecientesPorLugar(lugarId: number, desde: Date): Promise<ReporteSaturacion[]> {
    return this.todos()
      .filter((r) => r.lugarId === lugarId && r.fechaHora >= desde)
      .sort(masNuevoPrimero);
  }

  async contarPorLugarDesde(lugarId: number, desde: Date): Promise<number> {
    return this.todos().filter((r) => r.lugarId === lugarId && r.fechaHora >= desde && r.estado === EstadoReporte.ACTIVO)
      .length;
  }

  async contarPremiadosDeUsuarioDesde(usuarioId: number, desde: Date): Promise<number> {
    return this.todos().filter((r) => r.usuarioId === usuarioId && r.fechaHora >= desde && r.puntosOtorgados > 0).length;
  }

  async registrarPuntos(reporteId: number, puntos: number, motivo: MotivoSinPuntos | null) {
    return this.modificar(reporteId, { puntosOtorgados: puntos, motivoSinPuntos: motivo });
  }

  async listarPorUsuario(usuarioId: number, paginacion: Paginacion): Promise<Pagina<ReporteSaturacion>> {
    return this.paginar(this.todos().filter((r) => r.usuarioId === usuarioId), paginacion);
  }

  async actualizarEstado(id: number, estado: EstadoReporte) {
    return this.modificar(id, { estado });
  }

  async actualizarConfiabilidad(id: number, nivel: number) {
    return this.modificar(id, { nivelConfiabilidad: nivel });
  }

  async agregarPorHora(consulta: ConsultaAgregada): Promise<AgregadoHora[]> {
    const acumulado = new Map<string, { dia: string; hora: number; suma: number; muestras: number }>();
    for (const r of this.todos()) {
      if (r.lugarId !== consulta.lugarId || r.estado !== EstadoReporte.ACTIVO) continue;
      if (r.fechaHora < consulta.desde || r.fechaHora >= consulta.hasta) continue;
      const { dia, hora, finDeSemana } = enZona(r.fechaHora, consulta.zonaHoraria);
      if (consulta.dias === FiltroDias.LABORABLES && finDeSemana) continue;
      if (consulta.dias === FiltroDias.FIN_DE_SEMANA && !finDeSemana) continue;
      const clave = `${dia}#${hora}`;
      const celda = acumulado.get(clave) ?? { dia, hora, suma: 0, muestras: 0 };
      celda.suma += VALOR[r.nivelSaturacion];
      celda.muestras += 1;
      acumulado.set(clave, celda);
    }
    return [...acumulado.values()]
      .sort((a, b) => a.dia.localeCompare(b.dia) || a.hora - b.hora)
      .map(({ dia, hora, suma, muestras }) => ({ dia, hora, promedio: suma / muestras, muestras }));
  }

  async listarPendientesDeValidar(filtro: FiltroPendientes, paginacion: Paginacion): Promise<Pagina<ReporteSaturacion>> {
    const lugares = filtro.lugarIds ? new Set(filtro.lugarIds) : undefined;
    return this.paginar(
      this.todos().filter(
        (r) =>
          r.usuarioId !== filtro.usuarioId &&
          r.estado === EstadoReporte.ACTIVO &&
          r.fechaHora >= filtro.desde &&
          (!lugares || lugares.has(r.lugarId)),
      ),
      paginacion,
    );
  }

  private todos(): ReporteSaturacion[] {
    return [...this.filas.values()];
  }

  private paginar(filas: ReporteSaturacion[], paginacion: Paginacion): Pagina<ReporteSaturacion> {
    const ordenadas = filas.sort(masNuevoPrimero);
    const desde = desplazamiento(paginacion);
    return armarPagina(ordenadas.slice(desde, desde + paginacion.size), ordenadas.length, paginacion);
  }

  private async modificar(id: number, cambios: Partial<ReporteSaturacion>): Promise<ReporteSaturacion | null> {
    const actual = this.filas.get(id);
    if (!actual) return null;
    const nuevo = { ...actual, ...cambios, updatedAt: new Date() };
    this.filas.set(id, nuevo);
    return nuevo;
  }
}
