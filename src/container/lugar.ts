import { LugarController } from '../controller/LugarController.js';
import type { FavoritoDAO } from '../dao/FavoritoDAO.js';
import type { LugarDAO } from '../dao/LugarDAO.js';
import type { ReporteDAO } from '../dao/ReporteDAO.js';
import { crearLugarRouter } from '../route/lugar.routes.js';
import { LugarServiceImpl } from '../service/impl/LugarServiceImpl.js';
import type { LugarService } from '../service/LugarService.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';

/** Ports of the places stream; tests (and later the other streams) replace any of them. */
export interface DependenciasLugar {
  lugarDAO: LugarDAO;
  favoritoDAO: Pick<FavoritoDAO, 'buscar'>;
  reporteDAO: Pick<ReporteDAO, 'contarPorLugarDesde'>;
}

/** Stand-in until M3 delivers FavoritoDAOSequelize: nobody has favourites (`esFavorito` is false in production). */
export const favoritosPendientesDeM3: DependenciasLugar['favoritoDAO'] = { buscar: async () => null };

/** The injected ports (`infra.lugar`) and, for the rest, the shared DAOs of the composition root (the real places and reports ones) or the stand-in above. */
export function resolverDependenciasLugar({ lugarDAO, reporteDAO, lugar = {} }: Infraestructura): DependenciasLugar {
  return {
    lugarDAO: lugar.lugarDAO ?? lugarDAO,
    favoritoDAO: lugar.favoritoDAO ?? favoritosPendientesDeM3,
    reporteDAO: lugar.reporteDAO ?? reporteDAO,
  };
}

/** LugarService over the ports of `resolverDependenciasLugar`. */
export function crearLugarService(infra: Infraestructura): LugarService {
  const { cfg, reloj } = infra;
  return new LugarServiceImpl({
    ...resolverDependenciasLugar(infra),
    reloj,
    ventanaSaturacionMin: cfg.reglas.saturacionVentanaMin,
    zonaHoraria: cfg.servidor.zonaHoraria,
  });
}

/** Places stream (M2; exploration M3 shares the router: its two literal routes stay 501 stubs until M3 replaces them). */
export function construirLugar(infra: Infraestructura): MontajeRuta[] {
  const controller = new LugarController(crearLugarService(infra));
  return [{ modulo: 'lugar', ruta: '/api', router: crearLugarRouter(infra.guardas, controller, infra.cfg.lugares) }];
}
