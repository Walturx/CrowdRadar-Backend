import type { NotificadorPush } from '../adapter/push/NotificadorPush.js';
import { ConsolaNotificadorAdapter } from '../adapter/push/impl/ConsolaNotificadorAdapter.js';
import { AlertaController } from '../controller/AlertaController.js';
import type { AlertaDAO } from '../dao/AlertaDAO.js';
import type { DispositivoDAO } from '../dao/DispositivoDAO.js';
import type { FavoritoDAO } from '../dao/FavoritoDAO.js';
import { AlertaDAOSequelize } from '../dao/impl/sequelize/AlertaDAOSequelize.js';
import { DispositivoDAOSequelize } from '../dao/impl/sequelize/DispositivoDAOSequelize.js';
import { FavoritoDAOSequelize } from '../dao/impl/sequelize/FavoritoDAOSequelize.js';
import { nombresLugarSequelize } from '../dao/impl/sequelize/nombresLugarSequelize.js';
import type { ResolverNombresLugar } from '../dao/ResolverNombresLugar.js';
import { AlertaFavoritosObserver } from '../pattern/observer/AlertaFavoritosObserver.js';
import { crearAlertaRouter } from '../route/alerta.routes.js';
import { crearFavoritoRouter } from '../route/favorito.routes.js';
import { AlertaServiceImpl } from '../service/impl/AlertaServiceImpl.js';
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

export function crearDaosFavoritoAlertaSequelize(): DaosFavoritoAlerta {
  return {
    favoritoDAO: new FavoritoDAOSequelize(),
    alertaDAO: new AlertaDAOSequelize(),
    dispositivoDAO: new DispositivoDAOSequelize(),
    nombresLugar: nombresLugarSequelize,
  };
}

/**
 * Favourites and alerts stream (M3). Subscribes AlertaFavoritosObserver to the shared saturation subject so a
 * level change published after a report commit reaches the followers of the place.
 */
export function construirFavoritoAlerta(
  { guardas, logger, subject }: Infraestructura,
  daos: DaosFavoritoAlerta = crearDaosFavoritoAlertaSequelize(),
): MontajeRuta[] {
  const { favoritoDAO, alertaDAO, dispositivoDAO, nombresLugar } = daos;
  const notificador = daos.notificador ?? new ConsolaNotificadorAdapter(logger);
  subject.suscribir(new AlertaFavoritosObserver({ favoritoDAO, alertaDAO, dispositivoDAO, notificador, nombresLugar, logger }));
  const alertas = new AlertaController(new AlertaServiceImpl({ alertaDAO, nombresLugar }));
  return [
    { modulo: 'favorito', ruta: '/api', router: crearFavoritoRouter(guardas) },
    { modulo: 'alerta', ruta: '/api', router: crearAlertaRouter(guardas, { alertas }) },
  ];
}
