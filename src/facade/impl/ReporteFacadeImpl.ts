import type { LugarDAO } from '../../dao/LugarDAO.js';
import type { ConexionBD } from '../../datasource/ConexionBD.js';
import type { NivelSaturacion } from '../../enum/NivelSaturacion.js';
import { LugarNoEncontradoException } from '../../exception/lugar/LugarNoEncontradoException.js';
import { crearEventoSaturacion } from '../../pattern/observer/SaturacionCambiadaEvento.js';
import type { SaturacionSubject } from '../../pattern/observer/SaturacionSubject.js';
import type { KarmaService } from '../../service/KarmaService.js';
import type { ReporteService } from '../../service/ReporteService.js';
import type { SaturacionService } from '../../service/SaturacionService.js';
import type { Logger } from '../../util/logger.js';
import type { ReporteFacade, ReporteRegistrado } from '../ReporteFacade.js';

export interface DependenciasReporteFacade {
  lugarDAO: LugarDAO;
  reporteService: ReporteService;
  karmaService: KarmaService;
  saturacionService: SaturacionService;
  subject: SaturacionSubject;
  conexion: ConexionBD;
  logger: Logger;
  /** Longest the answer waits for the subscribers after the commit (EVENTOS_PRESUPUESTO_MS). */
  presupuestoEventosMs?: number;
}

/** Default of `presupuestoEventosMs`: half a second keeps the 201 fast while a healthy delivery still finishes in it. */
export const PRESUPUESTO_EVENTOS_MS = 500;

/**
 * Pattern: Facade (it also publishes to the Observer subject; owner: M4). One transaction per report: cooldown check
 * (serialized per user and place by the DAO lock), then the row lock of the place (`FOR UPDATE`, so reports of
 * different users on one place recompute the saturation one at a time), insert, karma (serialized per user by the
 * DAO) and saturation recompute. The level-change event goes out only after the commit and only when the level
 * changed; a failing subscriber never undoes the report, and a slow one never delays the answer beyond
 * `presupuestoEventosMs` (the delivery continues in the background). It adds no business calculation of its own.
 */
export class ReporteFacadeImpl implements ReporteFacade {
  constructor(private readonly deps: DependenciasReporteFacade) {}

  async registrar(usuarioId: number, lugarId: number, nivel: NivelSaturacion): Promise<ReporteRegistrado> {
    const { lugarDAO, reporteService, karmaService, saturacionService, conexion } = this.deps;
    const lugar = await lugarDAO.buscarPorId(lugarId);
    if (!lugar) throw new LugarNoEncontradoException();

    const { creado, karma, cambio } = await conexion.transaccion(async (tx) => {
      await reporteService.validarCooldown(usuarioId, lugarId, tx);
      await lugarDAO.buscarPorIdParaActualizar(lugarId, tx);
      const nuevo = await reporteService.crear(usuarioId, lugarId, nivel, tx);
      const resultadoKarma = await karmaService.otorgarPorReporte(usuarioId, nuevo.id, tx);
      const cambioSaturacion = await saturacionService.recalcular(lugarId, tx);
      return { creado: nuevo, karma: resultadoKarma, cambio: cambioSaturacion };
    });

    if (cambio.anterior !== cambio.nuevo) {
      await this.publicar(
        crearEventoSaturacion({
          ocurridoEn: cambio.actualizadoEn,
          lugarId,
          nivelAnterior: cambio.anterior,
          nivelNuevo: cambio.nuevo,
          autorId: usuarioId,
        }),
      );
    }
    this.deps.logger.info(
      { reporteId: creado.id, usuarioId, lugarId, nivelAnterior: cambio.anterior, nivelNuevo: cambio.nuevo, puntos: karma.puntosGanados },
      'Reporte registrado',
    );
    return {
      reporte: { ...creado, puntosOtorgados: karma.puntosGanados, motivoSinPuntos: karma.motivoSinPuntos },
      karma,
      lugar: { ...lugar, saturacionActual: cambio.nuevo, saturacionActualizadaEn: cambio.actualizadoEn },
    };
  }

  /**
   * The report is already committed: whatever the subject does, the caller still gets its success. The delivery is
   * raced against the budget; when it loses, the answer goes out and the delivery finishes (or fails, logged) alone.
   */
  private async publicar(evento: ReturnType<typeof crearEventoSaturacion>): Promise<void> {
    const { logger, subject, presupuestoEventosMs = PRESUPUESTO_EVENTOS_MS } = this.deps;
    const entrega = Promise.resolve()
      .then(() => subject.notificar(evento))
      .catch((err: unknown) => {
        logger.error({ err, lugarId: evento.lugarId }, 'Fallo la publicacion del cambio de saturacion; se ignora');
      })
      .then(() => 'ENTREGADO' as const);
    let temporizador: NodeJS.Timeout | undefined;
    const agotado = new Promise<'AGOTADO'>((resolver) => {
      temporizador = setTimeout(() => resolver('AGOTADO'), presupuestoEventosMs);
    });
    const resultado = await Promise.race([entrega, agotado]);
    clearTimeout(temporizador);
    if (resultado === 'AGOTADO') {
      logger.warn(
        { lugarId: evento.lugarId, presupuestoMs: presupuestoEventosMs },
        'La entrega de eventos supero el presupuesto; sigue en segundo plano',
      );
    }
  }
}
