import type { Sembrador } from '../../../dao/Sembrador.js';

/** Sembrador for in-memory DAOs: no FK to satisfy, so it only hands out distinct ids. */
export function crearSembradorMemoria(): Sembrador {
  let ultimo = 1000;
  const siguiente = async () => ++ultimo;
  return { usuario: siguiente, lugar: siguiente, reporte: siguiente, favorito: siguiente };
}
