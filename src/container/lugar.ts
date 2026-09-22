import type { FavoritoDAO } from '../dao/FavoritoDAO.js';
import { LugarDAOSequelize } from '../dao/impl/sequelize/LugarDAOSequelize.js';
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

/** Stand-in until M3 delivers FavoritoDAOSequelize: nobody has favourites. */
const favoritosPendientesDeM3: DependenciasLugar['favoritoDAO'] = { buscar: async () => null };

/** Stand-in until M4 delivers ReporteDAOSequelize: no recent reports. */
const reportesPendientesDeM4: DependenciasLugar['reporteDAO'] = { contarPorLugarDesde: async () => 0 };

/** LugarService over the injected ports (`infra.lugar`) and, for the rest, the production DAOs or the stand-ins above. */
export function crearLugarService({ cfg, reloj, lugar = {} }: Infraestructura): LugarService {
  return new LugarServiceImpl({
    lugarDAO: lugar.lugarDAO ?? new LugarDAOSequelize(),
    favoritoDAO: lugar.favoritoDAO ?? favoritosPendientesDeM3,
    reporteDAO: lugar.reporteDAO ?? reportesPendientesDeM4,
    reloj,
    ventanaSaturacionMin: cfg.reglas.saturacionVentanaMin,
    zonaHoraria: cfg.servidor.zonaHoraria,
  });
}

/** Places stream (M2; exploration M3 shares the router). The router is still the stub until the controller lands. */
export function construirLugar({ guardas }: Infraestructura): MontajeRuta[] {
  return [{ modulo: 'lugar', ruta: '/api', router: crearLugarRouter(guardas) }];
}
