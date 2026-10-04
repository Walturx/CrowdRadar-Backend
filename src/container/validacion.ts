import { crearValidacionRouter } from '../route/validacion.routes.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';

/** Validation and reporting-abuse stream (M5). Mounted after the reports stream. */
export function construirValidacion({ guardas }: Infraestructura): MontajeRuta[] {
  return [{ modulo: 'validacion', ruta: '/api', router: crearValidacionRouter(guardas) }];
}
