import { crearLugarRouter } from '../route/lugar.routes.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';

/** Places stream (M2; exploration M3 shares the router). Stub until M2 wires LugarDAO/LugarService here. */
export function construirLugar({ guardas }: Infraestructura): MontajeRuta[] {
  return [{ modulo: 'lugar', ruta: '/api', router: crearLugarRouter(guardas) }];
}
