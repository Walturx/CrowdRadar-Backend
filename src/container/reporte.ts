import { crearAnaliticaRouter } from '../route/analitica.routes.js';
import { crearReporteRouter } from '../route/reporte.routes.js';
import type { MontajeRuta } from './Contenedor.js';
import type { Infraestructura } from './infraestructura.js';

/**
 * Reports and analytics stream (M4). Must be mounted before the validation stream so
 * /reportes/mios is never captured by /reportes/:id.
 */
export function construirReporte({ guardas }: Infraestructura): MontajeRuta[] {
  return [
    { modulo: 'reporte', ruta: '/api', router: crearReporteRouter(guardas) },
    { modulo: 'analitica', ruta: '/api', router: crearAnaliticaRouter(guardas) },
  ];
}
