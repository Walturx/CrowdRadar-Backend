import type { NotificadorPush } from '../../adapter/push/NotificadorPush.js';
import type { AlertaDAO } from '../../dao/AlertaDAO.js';
import type { DispositivoDAO } from '../../dao/DispositivoDAO.js';
import type { FavoritoDAO } from '../../dao/FavoritoDAO.js';
import type { ResolverNombresLugar } from '../../dao/ResolverNombresLugar.js';
import type { LugarFavorito } from '../../entity/LugarFavorito.js';
import type { NivelSaturacion } from '../../enum/NivelSaturacion.js';
import { conTiempoLimite, mapearConLimite } from '../../util/concurrencia.js';
import type { Logger } from '../../util/logger.js';
import type { SaturacionCambiadaEvento } from './SaturacionCambiadaEvento.js';
import type { SaturacionObserver } from './SaturacionObserver.js';

const ETIQUETA_NIVEL: Record<NivelSaturacion, string> = {
  TRANQUILO: 'Tranquilo',
  MODERADO: 'Moderado',
  SATURADO: 'Saturado',
};
const SIN_INFORMACION = 'Sin información';
const LUGAR_GENERICO = 'Un lugar de tus favoritos';
/** Width of `alerta.mensaje` (migration 08). */
const MAX_MENSAJE = 200;

export interface DependenciasAlertaFavoritosObserver {
  favoritoDAO: FavoritoDAO;
  alertaDAO: AlertaDAO;
  dispositivoDAO: DispositivoDAO;
  notificador: NotificadorPush;
  nombresLugar: ResolverNombresLugar;
  logger: Logger;
  /** Followers served at the same time (ALERTAS_CONCURRENCIA). */
  concurrencia?: number;
  /** Longest one push may take before it is given up (PUSH_TIMEOUT_MS). */
  pushTimeoutMs?: number;
}

const CONCURRENCIA_POR_DEFECTO = 5;
const PUSH_TIMEOUT_POR_DEFECTO_MS = 3000;

/**
 * Pattern: Observer (subscriber). Owner: M3. Turns a saturation change into an in-app alert (the guaranteed
 * channel, persisted first) and a push for each user that follows the place with alerts on, except the author.
 *
 * Every failure is isolated and logged, never thrown: a push provider that is down keeps the alert, one
 * recipient failing does not block the others, and the publisher (so the report request) never sees an error.
 * Recipients are served with bounded concurrency and each push has a time limit, so a popular place or a stuck
 * provider cannot hold the work (or the connection pool) for long.
 */
export class AlertaFavoritosObserver implements SaturacionObserver {
  readonly nombre = 'alerta-favoritos';

  constructor(private readonly deps: DependenciasAlertaFavoritosObserver) {}

  alRecibir(evento: SaturacionCambiadaEvento): Promise<void> {
    return this.alCambiarSaturacion(evento);
  }

  async alCambiarSaturacion(evento: SaturacionCambiadaEvento): Promise<void> {
    const { nivelAnterior, nivelNuevo, lugarId, autorId } = evento;
    try {
      if (nivelNuevo === null || nivelAnterior === nivelNuevo) return;
      const seguidores = await this.deps.favoritoDAO.listarConAlertasPorLugar(lugarId);
      const destinatarios = seguidores.filter((favorito) => favorito.usuarioId !== autorId);
      if (destinatarios.length === 0) return;
      const lugar = await this.nombreDelLugar(lugarId);
      await mapearConLimite(destinatarios, this.deps.concurrencia ?? CONCURRENCIA_POR_DEFECTO, (favorito) =>
        this.avisar(favorito, lugar, evento, nivelNuevo),
      );
    } catch (err) {
      this.deps.logger.error({ err, lugarId }, 'No se pudieron generar las alertas del cambio de saturacion');
    }
  }

  /** A place whose name cannot be read still alerts, with a generic name. */
  private async nombreDelLugar(lugarId: number): Promise<string> {
    try {
      return (await this.deps.nombresLugar([lugarId])).get(lugarId) ?? LUGAR_GENERICO;
    } catch (err) {
      this.deps.logger.error({ err, lugarId }, 'No se pudo leer el nombre del lugar para la alerta');
      return LUGAR_GENERICO;
    }
  }

  private async avisar(
    favorito: LugarFavorito,
    lugar: string,
    evento: SaturacionCambiadaEvento,
    nivelNuevo: NivelSaturacion,
  ): Promise<void> {
    const { usuarioId } = favorito;
    try {
      const anterior = evento.nivelAnterior ? ETIQUETA_NIVEL[evento.nivelAnterior] : SIN_INFORMACION;
      const nuevo = ETIQUETA_NIVEL[nivelNuevo];
      await this.deps.alertaDAO.crear({
        favoritoId: favorito.id,
        usuarioId,
        lugarId: evento.lugarId,
        nivelAnterior: evento.nivelAnterior,
        nivelNuevo,
        mensaje: `${lugar} ahora está ${nuevo}. La saturación cambió de ${anterior} a ${nuevo}.`.slice(0, MAX_MENSAJE),
        fechaHora: evento.ocurridoEn,
      });
      await this.enviarPush(usuarioId, { titulo: lugar, cuerpo: `Ahora está ${nuevo} (antes: ${anterior}).` }, evento.lugarId);
    } catch (err) {
      this.deps.logger.error({ err, usuarioId, lugarId: evento.lugarId }, 'No se pudo alertar a un seguidor del lugar');
    }
  }

  /** The alert is already stored: a push failure (or timeout) is only logged, and so is a failed token cleanup. */
  private async enviarPush(usuarioId: number, mensaje: { titulo: string; cuerpo: string }, lugarId: number): Promise<void> {
    const { dispositivoDAO, notificador, logger, pushTimeoutMs = PUSH_TIMEOUT_POR_DEFECTO_MS } = this.deps;
    const tokens = await dispositivoDAO.listarTokensPorUsuario(usuarioId);
    if (tokens.length === 0) return;
    let tokensInvalidos: readonly string[];
    try {
      const envio = notificador.enviar(tokens, { ...mensaje, data: { lugarId: String(lugarId) } });
      ({ tokensInvalidos } = await conTiempoLimite(envio, pushTimeoutMs));
    } catch (err) {
      logger.error({ err, usuarioId, lugarId }, 'El proveedor de push fallo o agoto el tiempo; la alerta queda guardada');
      return;
    }
    if (tokensInvalidos.length === 0) return;
    try {
      await dispositivoDAO.eliminarTokens(tokensInvalidos);
    } catch (err) {
      logger.error({ err, usuarioId, lugarId }, 'No se pudieron borrar los tokens invalidos de push');
    }
  }
}
