import type { LugarDAO } from '../../dao/LugarDAO.js';
import type { ConexionBD } from '../../datasource/ConexionBD.js';
import type { NivelSaturacion } from '../../enum/NivelSaturacion.js';
import { CodigoError } from '../../exception/CodigoError.js';
import { RecursoNoEncontradoException } from '../../exception/http/RecursoNoEncontradoException.js';
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
}

/**
 * Pattern: Facade. One transaction per report: cooldown check (serialized per user and place by the DAO lock),
 * insert, karma and saturation recompute. The level-change event goes out only after the commit and only when
 * the level changed; a failing subscriber never undoes the report. It adds no business calculation of its own.
 */
export class ReporteFacadeImpl implements ReporteFacade {
  constructor(private readonly deps: DependenciasReporteFacade) {}

  async registrar(usuarioId: number, lugarId: number, nivel: NivelSaturacion): Promise<ReporteRegistrado> {
    const { lugarDAO, reporteService, karmaService, saturacionService, conexion } = this.deps;
    const lugar = await lugarDAO.buscarPorId(lugarId);
    if (!lugar) throw new RecursoNoEncontradoException(CodigoError.LUGAR_NO_ENCONTRADO, 'Lugar no encontrado.');

    const { creado, karma, cambio } = await conexion.transaccion(async (tx) => {
      await reporteService.validarCooldown(usuarioId, lugarId, tx);
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
    return {
      reporte: { ...creado, puntosOtorgados: karma.puntosGanados, motivoSinPuntos: karma.motivoSinPuntos },
      karma,
      lugar: { ...lugar, saturacionActual: cambio.nuevo, saturacionActualizadaEn: cambio.actualizadoEn },
    };
  }

  /** The report is already committed: whatever the subject does, the caller still gets its success. */
  private async publicar(evento: ReturnType<typeof crearEventoSaturacion>): Promise<void> {
    try {
      await this.deps.subject.notificar(evento);
    } catch (err) {
      this.deps.logger.error({ err, lugarId: evento.lugarId }, 'Fallo la publicacion del cambio de saturacion; se ignora');
    }
  }
}
