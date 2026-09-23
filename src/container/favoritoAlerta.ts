import type { NotificadorPush } from '../adapter/push/NotificadorPush.js';
import { ConsolaNotificadorAdapter } from '../adapter/push/impl/ConsolaNotificadorAdapter.js';
import { FcmNotificadorAdapter } from '../adapter/push/impl/FcmNotificadorAdapter.js';
import type { ConfiguracionApp } from '../config/ConfiguracionApp.js';
import { AlertaController } from '../controller/AlertaController.js';
import { FavoritoController } from '../controller/FavoritoController.js';
import { DispositivoController } from '../controller/DispositivoController.js';
import type { AlertaDAO } from '../dao/AlertaDAO.js';
import type { DispositivoDAO } from '../dao/DispositivoDAO.js';
import type { FavoritoDAO } from '../dao/FavoritoDAO.js';
import { AlertaDAOSequelize } from '../dao/impl/sequelize/AlertaDAOSequelize.js';
import { DispositivoDAOSequelize } from '../dao/impl/sequelize/DispositivoDAOSequelize.js';
import { FavoritoDAOSequelize } from '../dao/impl/sequelize/FavoritoDAOSequelize.js';
import type { LugarDAO } from '../dao/LugarDAO.js';
import { resolverNombresDesde, type ResolverNombresLugar } from '../dao/ResolverNombresLugar.js';
import { AlertaFavoritosObserver } from '../pattern/observer/AlertaFavoritosObserver.js';
import { crearAlertaRouter } from '../route/alerta.routes.js';
import { crearFavoritoRouter } from '../route/favorito.routes.js';
import { FavoritoServiceImpl } from '../service/impl/FavoritoServiceImpl.js';
import { AlertaServiceImpl } from '../service/impl/AlertaServiceImpl.js';
import { DispositivoServiceImpl } from '../service/impl/DispositivoServiceImpl.js';
import type { Logger } from '../util/logger.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';

/** Ports of the favourites and alerts stream; production uses Sequelize, tests hand in-memory ones. */
export interface DaosFavoritoAlerta {
  favoritoDAO: FavoritoDAO;
  alertaDAO: AlertaDAO;
  dispositivoDAO: DispositivoDAO;
  nombresLugar: ResolverNombresLugar;
  /** Replaces the provider chosen by PUSH_PROVEEDOR (tests inject a spy). */
  notificador?: NotificadorPush;
}

/** Production ports; the place names come from the shared LugarDAO of the composition root. */
export function crearDaosFavoritoAlertaSequelize(lugarDAO: Pick<LugarDAO, 'buscarPorIds'>): DaosFavoritoAlerta {
  return {
    favoritoDAO: new FavoritoDAOSequelize(),
    alertaDAO: new AlertaDAOSequelize(),
    dispositivoDAO: new DispositivoDAOSequelize(),
    nombresLugar: resolverNombresDesde(lugarDAO),
  };
}

/** Push provider named by PUSH_PROVEEDOR: the console adapter by default, the FCM skeleton with `fcm`. */
export function crearNotificadorPush({ proveedor, fcmCredencialesRuta }: ConfiguracionApp['push'], logger: Logger): NotificadorPush {
  if (proveedor === 'fcm') return new FcmNotificadorAdapter({ proveedor, credencialesRuta: fcmCredencialesRuta });
  return new ConsolaNotificadorAdapter(logger);
}

/**
 * Favourites and alerts stream (M3). Subscribes AlertaFavoritosObserver to the shared saturation subject so a
 * level change published after a report commit reaches the followers of the place.
 */
export function construirFavoritoAlerta(
  { cfg, guardas, logger, subject, lugarDAO, reloj }: Infraestructura,
  daos: DaosFavoritoAlerta,
): MontajeRuta[] {
  const { favoritoDAO, alertaDAO, dispositivoDAO, nombresLugar } = daos;
  const notificador = daos.notificador ?? crearNotificadorPush(cfg.push, logger);
  subject.suscribir(new AlertaFavoritosObserver({ favoritoDAO, alertaDAO, dispositivoDAO, notificador, nombresLugar, logger }));
  const alertas = new AlertaController(new AlertaServiceImpl({ alertaDAO, nombresLugar }));
  const dispositivos = new DispositivoController(new DispositivoServiceImpl({ dispositivoDAO }));
  const favoritos = new FavoritoController(
    new FavoritoServiceImpl({ favoritoDAO, lugarDAO, reloj, ventanaSaturacionMin: cfg.reglas.saturacionVentanaMin }),
  );
  return [
    { modulo: 'favorito', ruta: '/api', router: crearFavoritoRouter(guardas, favoritos) },
    { modulo: 'alerta', ruta: '/api', router: crearAlertaRouter(guardas, { alertas, dispositivos }) },
  ];
}
