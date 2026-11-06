import type { PuntajeDAO } from '../../dao/PuntajeDAO.js';
import type { ContextoTx } from '../../datasource/ConexionBD.js';
import { PUNTOS_POR_REPORTE_VALIDADO, puntajeDe, type Puntaje } from '../../entity/puntaje.js';
import type { ReglaEstadoValidacion } from '../../pattern/strategy/confiabilidad/derivarEstadoValidacion.js';
import type { PuntajeService } from '../PuntajeService.js';

export interface DependenciasPuntajeService {
  puntajeDAO: PuntajeDAO;
  /** The same rule the reliability strategy and ValidacionServiceImpl use (CONFIABILIDAD_*). */
  regla: ReglaEstadoValidacion;
}

const SIN_APORTES = { reportesValidados: 0, votosAcertados: 0 };

/** Pattern: Service layer. Turns the counts the DAO reads into points and tier (entity/puntaje.ts). */
export class PuntajeServiceImpl implements PuntajeService {
  constructor(private readonly deps: DependenciasPuntajeService) {}

  async obtener(usuarioId: number, tx?: ContextoTx): Promise<Puntaje> {
    const aportes = await this.deps.puntajeDAO.contarAportes([usuarioId], this.deps.regla, tx);
    return puntajeDe(aportes.get(usuarioId) ?? SIN_APORTES);
  }

  async obtenerVarios(usuarioIds: readonly number[]): Promise<Map<number, Puntaje>> {
    const aportes = await this.deps.puntajeDAO.contarAportes(usuarioIds, this.deps.regla);
    return new Map([...new Set(usuarioIds)].map((id) => [id, puntajeDe(aportes.get(id) ?? SIN_APORTES)]));
  }

  async puntosDeReportes(reporteIds: readonly number[]): Promise<Map<number, number>> {
    const validados = new Set(await this.deps.puntajeDAO.listarValidados(reporteIds, this.deps.regla));
    return new Map(reporteIds.map((id) => [id, validados.has(id) ? PUNTOS_POR_REPORTE_VALIDADO : 0]));
  }
}
