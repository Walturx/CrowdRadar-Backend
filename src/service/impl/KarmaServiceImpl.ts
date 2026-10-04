import type { ReporteDAO } from '../../dao/ReporteDAO.js';
import type { UsuarioDAO } from '../../dao/UsuarioDAO.js';
import type { ContextoTx } from '../../datasource/ConexionBD.js';
import { MotivoSinPuntos } from '../../enum/MotivoSinPuntos.js';
import { CodigoError } from '../../exception/CodigoError.js';
import { RecursoNoEncontradoException } from '../../exception/http/RecursoNoEncontradoException.js';
import { UsuarioNoEncontradoException } from '../../exception/usuario/UsuarioNoEncontradoException.js';
import { inicioDelDiaEn } from '../../util/dia.js';
import type { Reloj } from '../../util/Reloj.js';
import type { KarmaService, ResultadoKarma } from '../KarmaService.js';

export interface DependenciasKarmaService {
  usuarioDAO: UsuarioDAO;
  reporteDAO: ReporteDAO;
  reloj: Reloj;
  karmaPorReporte: number;
  karmaPorValidacion: number;
  /** Rewarded reports allowed per calendar day of `zonaHoraria`. */
  reportesPremiadosPorDia: number;
  zonaHoraria: string;
}

/**
 * Pattern: Service layer. There is no movement table: the total is `usuario.puntos_karma` (atomic update through
 * UsuarioDAO.incrementarKarma) and each report keeps the points it earned and why it earned none.
 */
export class KarmaServiceImpl implements KarmaService {
  constructor(private readonly deps: DependenciasKarmaService) {}

  async otorgarPorReporte(usuarioId: number, reporteId: number, tx: ContextoTx): Promise<ResultadoKarma> {
    const { usuarioDAO, reporteDAO, reloj, zonaHoraria } = this.deps;
    const inicioDelDia = inicioDelDiaEn(reloj.ahora(), zonaHoraria);
    const premiados = await reporteDAO.contarPremiadosDeUsuarioDesde(usuarioId, inicioDelDia, tx);
    if (premiados >= this.deps.reportesPremiadosPorDia) {
      await reporteDAO.registrarPuntos(reporteId, 0, MotivoSinPuntos.TOPE_DIARIO, tx);
      const usuario = await usuarioDAO.buscarPorId(usuarioId, tx);
      if (!usuario) throw new UsuarioNoEncontradoException();
      return { puntosGanados: 0, total: usuario.puntosKarma, motivoSinPuntos: MotivoSinPuntos.TOPE_DIARIO };
    }
    const total = await usuarioDAO.incrementarKarma(usuarioId, this.deps.karmaPorReporte, tx);
    if (total === null) throw new UsuarioNoEncontradoException();
    await reporteDAO.registrarPuntos(reporteId, this.deps.karmaPorReporte, null, tx);
    return { puntosGanados: this.deps.karmaPorReporte, total, motivoSinPuntos: null };
  }

  async otorgarPorValidacion(usuarioId: number, tx: ContextoTx): Promise<number> {
    const total = await this.deps.usuarioDAO.incrementarKarma(usuarioId, this.deps.karmaPorValidacion, tx);
    return total === null ? 0 : this.deps.karmaPorValidacion;
  }

  async revocarPorReporteEliminado(reporteId: number, tx: ContextoTx): Promise<void> {
    const { usuarioDAO, reporteDAO } = this.deps;
    const reporte = await reporteDAO.buscarPorId(reporteId, tx);
    if (!reporte) throw new RecursoNoEncontradoException(CodigoError.REPORTE_NO_ENCONTRADO, 'Reporte no encontrado.');
    if (reporte.puntosOtorgados === 0) return;
    await usuarioDAO.incrementarKarma(reporte.usuarioId, -reporte.puntosOtorgados, tx);
    await reporteDAO.registrarPuntos(reporteId, 0, MotivoSinPuntos.REPORTE_ELIMINADO, tx);
  }
}
