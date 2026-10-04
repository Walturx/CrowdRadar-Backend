import type { Router } from 'express';
import type { ConexionBD } from '../datasource/ConexionBD.js';
import type { Logger } from '../util/logger.js';

/** A router, the module that owns it and the path it is mounted at; `Contenedor.rutas` is mounted in order. */
export interface MontajeRuta {
  modulo: string;
  ruta: string;
  router: Router;
}

/** Everything `createApp` needs, assembled once by the composition root. */
export interface Contenedor {
  conexion: ConexionBD;
  logger: Logger;
  /** CORS whitelist (exact origins). */
  corsOrigenes: readonly string[];
  /** Express `trust proxy` value: how the client IP is derived behind proxies. */
  trustProxy: boolean | number | string;
  /** Maximum JSON body size (body-parser string such as `100kb`). */
  limiteCuerpo: string;
  rutas: readonly MontajeRuta[];
}
