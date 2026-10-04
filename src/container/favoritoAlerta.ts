import { crearAlertaRouter } from '../route/alerta.routes.js';
import { crearFavoritoRouter } from '../route/favorito.routes.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';

/** Favourites and alerts stream (M3). Stubs until M3 wires its DAOs, services, observer and push adapter here. */
export function construirFavoritoAlerta({ guardas }: Infraestructura): MontajeRuta[] {
  return [
    { modulo: 'favorito', ruta: '/api', router: crearFavoritoRouter(guardas) },
    { modulo: 'alerta', ruta: '/api', router: crearAlertaRouter(guardas) },
  ];
}
