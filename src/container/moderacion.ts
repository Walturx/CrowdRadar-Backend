import { crearModeracionRouter } from '../route/moderacion.routes.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';

/** Moderation stream (M6), admin chain. */
export function construirModeracion({ guardas }: Infraestructura): MontajeRuta[] {
  return [{ modulo: 'moderacion', ruta: '/api/admin', router: crearModeracionRouter(guardas) }];
}
