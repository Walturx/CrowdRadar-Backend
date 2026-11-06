import type { PuntajeDAO } from '../../../../src/dao/PuntajeDAO.js';
import type { AportesUsuario } from '../../../../src/entity/puntaje.js';
import { EstadoReporte } from '../../../../src/enum/EstadoReporte.js';
import { EstadoValidacion } from '../../../../src/enum/EstadoValidacion.js';
import { TipoAccionValidacion } from '../../../../src/enum/TipoAccionValidacion.js';
import {
  estadoValidacionPorConteo,
  type ReglaEstadoValidacion,
} from '../../../../src/pattern/strategy/confiabilidad/derivarEstadoValidacion.js';
import type { ReporteDAOMemoria } from './ReporteDAOMemoria.js';
import type { ValidacionDAOMemoria } from './ValidacionDAOMemoria.js';

/** The vote that earns points for each validation state (the others earn nothing). */
const ACIERTO: Partial<Record<EstadoValidacion, TipoAccionValidacion>> = {
  [EstadoValidacion.VALIDADO]: TipoAccionValidacion.CONFIRMAR,
  [EstadoValidacion.RECHAZADO]: TipoAccionValidacion.RECHAZAR,
};

/**
 * In-memory PuntajeDAO for tests: the stand-in of the SQL join over the in-memory reports and votes. It applies the
 * TypeScript rule (`estadoValidacionPorConteo`), so the shared contract proves the SQL of PuntajeDAOSequelize agrees.
 */
export class PuntajeDAOMemoria implements PuntajeDAO {
  constructor(private readonly fuentes: { reportes: ReporteDAOMemoria; validaciones: ValidacionDAOMemoria }) {}

  async contarAportes(usuarioIds: readonly number[], regla: ReglaEstadoValidacion): Promise<Map<number, AportesUsuario>> {
    const resultado = new Map<number, AportesUsuario>(usuarioIds.map((id) => [id, { reportesValidados: 0, votosAcertados: 0 }]));
    if (resultado.size === 0) return resultado;
    const { estados, votos } = this.estados(regla);
    for (const [reporteId, { autorId, estado }] of estados) {
      const autor = resultado.get(autorId);
      if (autor && estado === EstadoValidacion.VALIDADO) autor.reportesValidados += 1;
      for (const voto of votos.filter((v) => v.reporteId === reporteId)) {
        const votante = resultado.get(voto.usuarioId);
        if (votante && ACIERTO[estado] === voto.tipoAccion) votante.votosAcertados += 1;
      }
    }
    return resultado;
  }

  async listarValidados(reporteIds: readonly number[], regla: ReglaEstadoValidacion): Promise<number[]> {
    if (reporteIds.length === 0) return [];
    const { estados } = this.estados(regla);
    return [...new Set(reporteIds)].filter((id) => estados.get(id)?.estado === EstadoValidacion.VALIDADO);
  }

  /** Validation state of every ACTIVO report. */
  private estados(regla: ReglaEstadoValidacion) {
    const votos = this.fuentes.validaciones.instantanea();
    const estados = new Map<number, { autorId: number; estado: EstadoValidacion }>();
    for (const reporte of this.fuentes.reportes.instantanea()) {
      if (reporte.estado !== EstadoReporte.ACTIVO) continue;
      const suyos = votos.filter((v) => v.reporteId === reporte.id);
      const confirmaciones = suyos.filter((v) => v.tipoAccion === TipoAccionValidacion.CONFIRMAR).length;
      estados.set(reporte.id, { autorId: reporte.usuarioId, estado: estadoValidacionPorConteo(confirmaciones, suyos.length, regla) });
    }
    return { estados, votos };
  }
}
