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
import { VALOR_NIVEL } from '../../../../src/entity/valorNivel.js';
import { relojSistema, type Reloj } from '../../../../src/util/Reloj.js';
import type { ContextoTx } from '../../../../src/datasource/ConexionBD.js';
import { CerrojosMemoria } from './cerrojosMemoria.js';
import { copia, exigirReferencia, sellosNuevos, type OpcionesMemoria } from './comun.js';
import type { SembradorMemoria } from './SembradorMemoria.js';

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

/** True when the instant falls on a day the query's `dias` filter keeps (query zone). */
function cuentaDia(fecha: Date, consulta: ConsultaAgregada): boolean {
  const { finDeSemana } = enZona(fecha, consulta.zonaHoraria);
  if (consulta.dias === FiltroDias.LABORABLES) return !finDeSemana;
  if (consulta.dias === FiltroDias.FIN_DE_SEMANA) return finDeSemana;
  return true;
}

/** What the pending list needs of the votes: the memory stand-in of `NOT EXISTS (SELECT 1 FROM validacion_reporte ...)`. */
export interface VotosDeUsuario {
  yaVoto(usuarioId: number, reporteId: number): boolean;
}

/** In-memory ReporteDAO for tests; behaves like the Sequelize one (shared contract test). */
export class ReporteDAOMemoria implements ReporteDAO {
  private readonly filas = new Map<number, ReporteSaturacion>();
  private readonly cerrojos = new CerrojosMemoria();
  private siguienteId = 1;
  private readonly reloj: Reloj;
  private readonly sembrador?: SembradorMemoria;
  private readonly validaciones?: VotosDeUsuario;

  constructor(opciones: OpcionesMemoria & { validaciones?: VotosDeUsuario } = {}) {
    this.reloj = opciones.reloj ?? relojSistema;
    this.sembrador = opciones.sembrador;
    this.validaciones = opciones.validaciones;
  }

  /** Seeds a ready-made entity (tests that need specific ids or states). */
  agregar(reporte: ReporteSaturacion): ReporteSaturacion {
    this.filas.set(reporte.id, copia(reporte));
    this.siguienteId = Math.max(this.siguienteId, reporte.id + 1);
    return copia(reporte);
  }

  async crear(datos: NuevoReporte): Promise<ReporteSaturacion> {
    exigirReferencia(this.sembrador, 'usuario', 'usuario_id', datos.usuarioId, 'reporte_saturacion');
    exigirReferencia(this.sembrador, 'lugar', 'lugar_id', datos.lugarId, 'reporte_saturacion');
    return this.agregar({
      ...datos,
      id: this.siguienteId,
      nivelConfiabilidad: null,
      estado: EstadoReporte.ACTIVO,
      puntosOtorgados: 0,
      motivoSinPuntos: null,
      ...sellosNuevos(this.reloj),
    });
  }

  async buscarPorId(id: number): Promise<ReporteSaturacion | null> {
    const reporte = this.filas.get(id);
    return reporte ? copia(reporte) : null;
  }

  /** Like the Sequelize one (`FOR UPDATE`): the row lock (key `reporte:<id>`) is held until the transaction ends. */
  async buscarPorIdParaActualizar(id: number, tx?: ContextoTx): Promise<ReporteSaturacion | null> {
    await this.cerrojos.adquirir(`reporte:${id}`, tx);
    return this.buscarPorId(id);
  }

  /** Like the Sequelize one, takes the (usuario, lugar) lock until the transaction ends (pg_advisory_xact_lock). */
  async buscarUltimoDeUsuarioEnLugar(
    usuarioId: number,
    lugarId: number,
    tx?: ContextoTx,
  ): Promise<ReporteSaturacion | null> {
    await this.cerrojos.adquirir(`${usuarioId}:${lugarId}`, tx);
    const ultimo = this.todos()
      .filter((r) => r.usuarioId === usuarioId && r.lugarId === lugarId)
      .sort(masNuevoPrimero)[0];
    return ultimo ? copia(ultimo) : null;
  }

  async listarRecientesPorLugar(lugarId: number, desde: Date): Promise<ReporteSaturacion[]> {
    return copia(
      this.todos()
        .filter((r) => r.lugarId === lugarId && r.fechaHora >= desde)
        .sort(masNuevoPrimero),
    );
  }

  async contarPorLugarDesde(lugarId: number, desde: Date): Promise<number> {
    return this.todos().filter((r) => r.lugarId === lugarId && r.fechaHora >= desde && r.estado === EstadoReporte.ACTIVO)
      .length;
  }

  /** Like the Sequelize one, takes the per-user lock (key `usuario:<id>`) until the transaction ends. */
  async contarPremiadosDeUsuarioDesde(usuarioId: number, desde: Date, tx?: ContextoTx): Promise<number> {
    await this.cerrojos.adquirir(`usuario:${usuarioId}`, tx);
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
      celda.suma += VALOR_NIVEL[r.nivelSaturacion];
      celda.muestras += 1;
      acumulado.set(clave, celda);
    }
    return [...acumulado.values()]
      .sort((a, b) => a.dia.localeCompare(b.dia) || a.hora - b.hora)
      .map(({ dia, hora, suma, muestras }) => ({ dia, hora, promedio: suma / muestras, muestras }));
  }

  async hayReportesSinteticos(consulta: ConsultaAgregada): Promise<boolean> {
    if (!this.sembrador) return false;
    return this.todos().some(
      (r) =>
        r.lugarId === consulta.lugarId &&
        r.estado === EstadoReporte.ACTIVO &&
        r.fechaHora >= consulta.desde &&
        r.fechaHora < consulta.hasta &&
        cuentaDia(r.fechaHora, consulta) &&
        this.sembrador!.esSintetico(r.usuarioId),
    );
  }

  async listarPendientesDeValidar(filtro: FiltroPendientes, paginacion: Paginacion): Promise<Pagina<ReporteSaturacion>> {
    const lugares = filtro.lugarIds ? new Set(filtro.lugarIds) : undefined;
    return this.paginar(
      this.todos().filter(
        (r) =>
          r.usuarioId !== filtro.usuarioId &&
          r.estado === EstadoReporte.ACTIVO &&
          r.fechaHora >= filtro.desde &&
          (!lugares || lugares.has(r.lugarId)) &&
          !this.validaciones?.yaVoto(filtro.usuarioId, r.id),
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
    return armarPagina(copia(ordenadas.slice(desde, desde + paginacion.size)), ordenadas.length, paginacion);
  }

  private async modificar(id: number, cambios: Partial<ReporteSaturacion>): Promise<ReporteSaturacion | null> {
    const actual = this.filas.get(id);
    if (!actual) return null;
    const nuevo = { ...actual, ...cambios, updatedAt: this.reloj.ahora() };
    this.filas.set(id, nuevo);
    return copia(nuevo);
  }
}
