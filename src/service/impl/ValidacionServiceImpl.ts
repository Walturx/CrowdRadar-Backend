import type { DenunciaDAO } from '../../dao/DenunciaDAO.js';
import type { LugarDAO } from '../../dao/LugarDAO.js';
import { armarPagina, desplazamiento, type Pagina, type Paginacion } from '../../dao/Paginacion.js';
import type { ReporteDAO } from '../../dao/ReporteDAO.js';
import type { UsuarioDAO } from '../../dao/UsuarioDAO.js';
import type { ValidacionDAO } from '../../dao/ValidacionDAO.js';
import type { ConexionBD, ContextoTx } from '../../datasource/ConexionBD.js';
import type { Lugar } from '../../entity/Lugar.js';
import type { ReporteSaturacion } from '../../entity/ReporteSaturacion.js';
import type { ValidacionReporte } from '../../entity/ValidacionReporte.js';
import { EstadoReporte } from '../../enum/EstadoReporte.js';
import { TipoAccionValidacion } from '../../enum/TipoAccionValidacion.js';
import { ConflictoException } from '../../exception/http/ConflictoException.js';
import { ReporteNoEncontradoException } from '../../exception/reporte/ReporteNoEncontradoException.js';
import { UsuarioNoEncontradoException } from '../../exception/usuario/UsuarioNoEncontradoException.js';
import { AutovalidacionException } from '../../exception/validacion/AutovalidacionException.js';
import { ValidacionDuplicadaException } from '../../exception/validacion/ValidacionDuplicadaException.js';
import { derivarEstadoValidacion } from '../../pattern/strategy/confiabilidad/derivarEstadoValidacion.js';
import type { EstrategiaConfiabilidad } from '../../pattern/strategy/confiabilidad/EstrategiaConfiabilidad.js';
import { bboxAlrededor, distanciaMetros } from '../../util/geo.js';
import type { Reloj } from '../../util/Reloj.js';
import { MS_POR_HORA } from '../../util/tiempo.js';
import type {
  ConfiabilidadReporte,
  ConsultaPendientes,
  DetalleReporte,
  EstadoMiReporte,
  ReportePendiente,
  ResultadoValidacion,
  ValidacionService,
} from '../ValidacionService.js';
import type { KarmaService } from '../KarmaService.js';

export interface DependenciasValidacionService {
  reporteDAO: ReporteDAO;
  lugarDAO: LugarDAO;
  validacionDAO: ValidacionDAO;
  denunciaDAO: DenunciaDAO;
  usuarioDAO: UsuarioDAO;
  karmaService: KarmaService;
  estrategia: EstrategiaConfiabilidad;
  conexion: ConexionBD;
  reloj: Reloj;
  /** CONFIABILIDAD_MIN_VOTOS_ESTADO: votes before a report counts as VALIDADO or RECHAZADO. */
  minVotosEstado: number;
  /** KARMA_POR_VALIDACION: stored on the vote as `puntosOtorgados`. */
  karmaPorValidacion: number;
  /** Cap of the places read around the caller (LUGARES_LIMITE_MAX). */
  limiteLugares: number;
}

/**
 * Pending reports are ordered by distance, which no single DAO query can do (the distance lives on the place), so the
 * newest candidates of the nearby places are loaded and sorted here. The window is at most 24 h of reports in one
 * radius, far below this cap; past it the oldest candidates are dropped.
 */
const TOPE_CANDIDATOS_PENDIENTES = 500;

/** Pattern: Service layer + Strategy context. Reports are validated by other users; reliability is recomputed on every vote. */
export class ValidacionServiceImpl implements ValidacionService {
  constructor(private readonly deps: DependenciasValidacionService) {}

  async listarPendientes(usuarioId: number, consulta: ConsultaPendientes): Promise<Pagina<ReportePendiente>> {
    const { reporteDAO, lugarDAO, validacionDAO, reloj } = this.deps;
    const centro = { lat: consulta.lat, lng: consulta.lng };
    const cercanos = await lugarDAO.explorar({ bbox: bboxAlrededor(centro, consulta.radioKm), limite: this.deps.limiteLugares });
    const distancias = new Map<number, number>();
    const lugares = new Map<number, Lugar>();
    for (const lugar of cercanos) {
      const metros = distanciaMetros(centro, { lat: lugar.latitud, lng: lugar.longitud });
      if (metros > consulta.radioKm * 1000) continue;
      distancias.set(lugar.id, metros);
      lugares.set(lugar.id, lugar);
    }
    const paginacion = { page: consulta.page, size: consulta.size };
    if (distancias.size === 0) return armarPagina([], 0, paginacion);
    const candidatos = await reporteDAO.listarPendientesDeValidar(
      {
        usuarioId,
        desde: new Date(reloj.ahora().getTime() - consulta.horas * MS_POR_HORA),
        lugarIds: [...distancias.keys()],
        excluirIds: await validacionDAO.listarReporteIdsVotadosPor(usuarioId),
      },
      { page: 1, size: TOPE_CANDIDATOS_PENDIENTES },
    );
    const ordenados = [...candidatos.items].sort(
      (a, b) =>
        (distancias.get(a.lugarId) ?? 0) - (distancias.get(b.lugarId) ?? 0) ||
        b.fechaHora.getTime() - a.fechaHora.getTime() ||
        b.id - a.id,
    );
    const desde = desplazamiento(paginacion);
    const pagina = ordenados.slice(desde, desde + consulta.size);
    const votos = await validacionDAO.listarVotosDeReportes(pagina.map((r) => r.id));
    const items = pagina.map((reporte) => ({
      reporte,
      lugar: lugares.get(reporte.lugarId) as Lugar,
      distanciaMetros: distancias.get(reporte.lugarId) as number,
      confiabilidad: this.describir(votos.filter((v) => v.reporteId === reporte.id)),
    }));
    return armarPagina(items, ordenados.length, paginacion);
  }

  async obtenerReporte(usuarioId: number, reporteId: number): Promise<DetalleReporte> {
    const { validacionDAO, denunciaDAO, lugarDAO } = this.deps;
    const reporte = await this.exigirReporteActivo(reporteId);
    const lugar = await lugarDAO.buscarPorId(reporte.lugarId);
    if (!lugar) throw new ReporteNoEncontradoException();
    const votos = await validacionDAO.listarVotos(reporteId);
    return {
      reporte,
      lugar,
      confiabilidad: this.describir(votos),
      miValidacion: votos.find((v) => v.usuarioId === usuarioId)?.tipoAccion ?? null,
      yaDenunciado: await denunciaDAO.existe(usuarioId, reporteId),
      esPropio: reporte.usuarioId === usuarioId,
    };
  }

  async consultarConfiabilidad(reporteId: number): Promise<ConfiabilidadReporte> {
    await this.exigirReporteActivo(reporteId);
    return this.describir(await this.deps.validacionDAO.listarVotos(reporteId));
  }

  async validar(usuarioId: number, reporteId: number, tipoAccion: TipoAccionValidacion): Promise<ResultadoValidacion> {
    const { reporteDAO, validacionDAO, usuarioDAO, karmaService, conexion, reloj, karmaPorValidacion } = this.deps;
    const reporte = await this.exigirReporteActivo(reporteId);
    if (reporte.usuarioId === usuarioId) throw new AutovalidacionException();
    return conexion.transaccion(async (tx) => {
      if (await validacionDAO.buscarPorUsuarioYReporte(usuarioId, reporteId, tx)) throw new ValidacionDuplicadaException();
      const votante = await usuarioDAO.buscarPorId(usuarioId, tx);
      if (!votante) throw new UsuarioNoEncontradoException();
      const validacion = await this.guardarVoto(
        { reporteId, usuarioId, tipoAccion, karmaVotante: votante.puntosKarma, puntosOtorgados: karmaPorValidacion, fechaHora: reloj.ahora() },
        tx,
      );
      const puntosGanados = await karmaService.otorgarPorValidacion(usuarioId, tx);
      const confiabilidad = this.describir(await validacionDAO.listarVotos(reporteId, tx));
      if (confiabilidad.porcentaje !== null) await reporteDAO.actualizarConfiabilidad(reporteId, confiabilidad.porcentaje, tx);
      const total = (await usuarioDAO.buscarPorId(usuarioId, tx))?.puntosKarma ?? votante.puntosKarma + puntosGanados;
      return { validacion, karma: { puntosGanados, total }, confiabilidad };
    });
  }

  async consultarEstadoMisReportes(usuarioId: number, paginacion: Paginacion): Promise<Pagina<EstadoMiReporte>> {
    const { reporteDAO, validacionDAO, lugarDAO } = this.deps;
    const pagina = await reporteDAO.listarPorUsuario(usuarioId, paginacion);
    const votos = await validacionDAO.listarVotosDeReportes(pagina.items.map((r) => r.id));
    const nombres = new Map((await lugarDAO.buscarPorIds(pagina.items.map((r) => r.lugarId))).map((l) => [l.id, l.nombre]));
    return {
      ...pagina,
      items: pagina.items.map((reporte) => ({
        reporte,
        lugarNombre: nombres.get(reporte.lugarId) ?? '',
        confiabilidad: this.describir(votos.filter((v) => v.reporteId === reporte.id)),
      })),
    };
  }

  /** 404 for a report that does not exist or was removed. */
  private async exigirReporteActivo(reporteId: number): Promise<ReporteSaturacion> {
    const reporte = await this.deps.reporteDAO.buscarPorId(reporteId);
    if (!reporte || reporte.estado === EstadoReporte.ELIMINADO) throw new ReporteNoEncontradoException();
    return reporte;
  }

  /** The unique (reporte, usuario) index also catches two simultaneous votes that both passed the pre-check. */
  private async guardarVoto(datos: Parameters<ValidacionDAO['crear']>[0], tx: ContextoTx): Promise<ValidacionReporte> {
    try {
      return await this.deps.validacionDAO.crear(datos, tx);
    } catch (error) {
      if (error instanceof ConflictoException) throw new ValidacionDuplicadaException();
      throw error;
    }
  }

  private describir(votos: readonly ValidacionReporte[]): ConfiabilidadReporte {
    const resultado = this.deps.estrategia.calcular(votos);
    const confirmaciones = votos.filter((v) => v.tipoAccion === TipoAccionValidacion.CONFIRMAR).length;
    return {
      ...resultado,
      confirmaciones,
      rechazos: votos.length - confirmaciones,
      estado: derivarEstadoValidacion(resultado, this.deps.minVotosEstado),
    };
  }
}
