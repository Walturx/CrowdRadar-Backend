import type { AlertaDAO } from '../../dao/AlertaDAO.js';
import type { Paginacion } from '../../dao/Paginacion.js';
import type { ResolverNombresLugar } from '../../dao/ResolverNombresLugar.js';
import { AlertaNoEncontradaException } from '../../exception/alerta/AlertaNoEncontradaException.js';
import type { AlertaConLugar, AlertaService, ListadoAlertas } from '../AlertaService.js';

export interface DependenciasAlertaService {
  alertaDAO: AlertaDAO;
  nombresLugar: ResolverNombresLugar;
}

/** Pattern: Service layer. Every operation is scoped to the caller: a foreign alert is "not found". */
export class AlertaServiceImpl implements AlertaService {
  private readonly alertaDAO: AlertaDAO;
  private readonly nombresLugar: ResolverNombresLugar;

  constructor({ alertaDAO, nombresLugar }: DependenciasAlertaService) {
    this.alertaDAO = alertaDAO;
    this.nombresLugar = nombresLugar;
  }

  async listar(usuarioId: number, paginacion: Paginacion): Promise<ListadoAlertas> {
    const [pagina, noLeidas] = await Promise.all([
      this.alertaDAO.listarPorUsuario(usuarioId, paginacion),
      this.alertaDAO.contarNoLeidas(usuarioId),
    ]);
    const nombres = await this.nombresLugar(pagina.items.map((alerta) => alerta.lugarId));
    const items = pagina.items.map((alerta) => ({ alerta, lugarNombre: nombres.get(alerta.lugarId) ?? '' }));
    return { pagina: { ...pagina, items }, noLeidas };
  }

  async marcarLeida(usuarioId: number, alertaId: number): Promise<AlertaConLugar> {
    const alerta = await this.alertaDAO.marcarLeida(alertaId, usuarioId);
    if (!alerta) throw new AlertaNoEncontradaException();
    const nombres = await this.nombresLugar([alerta.lugarId]);
    return { alerta, lugarNombre: nombres.get(alerta.lugarId) ?? '' };
  }

  contarNoLeidas(usuarioId: number): Promise<number> {
    return this.alertaDAO.contarNoLeidas(usuarioId);
  }
}
