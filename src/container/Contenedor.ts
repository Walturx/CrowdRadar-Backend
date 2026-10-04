import type { Router } from 'express';
import type { ConexionBD } from '../datasource/ConexionBD.js';
import type { Logger } from '../util/logger.js';

/** A router and the path it is mounted at; `Contenedor.rutas` is mounted in order. */
export interface MontajeRuta {
  ruta: string;
  router: Router;
}

/** Everything `createApp` needs, assembled once by the composition root. */
export interface Contenedor {
  conexion: ConexionBD;
  logger: Logger;
  rutas: readonly MontajeRuta[];
}
