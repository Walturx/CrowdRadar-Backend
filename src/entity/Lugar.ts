import type { CategoriaLugar } from '../enum/CategoriaLugar.js';
import type { NivelSaturacion } from '../enum/NivelSaturacion.js';

/** OpenStreetMap element type; an osm id is unique only within its type (migration 13). */
export type TipoOsm = 'node' | 'way' | 'relation';

/**
 * Domain entity for `lugar`. `saturacionActual`/`saturacionActualizadaEn` are written only
 * by M4 (LugarDAO.actualizarSaturacion) and read by M2/M3, who turn a null or stale level
 * into SIN_INFORMACION. Coordinates are decimal degrees.
 */
export interface Lugar {
  id: number;
  osmTipo: TipoOsm;
  osmId: number | null;
  nombre: string;
  direccion: string | null;
  latitud: number;
  longitud: number;
  categoria: CategoriaLugar;
  saturacionActual: NivelSaturacion | null;
  saturacionActualizadaEn: Date | null;
  horarioAtencion: string | null;
  /** Opening hour 0..23; with `horaCierre` (1..24, smaller means crossing midnight). */
  horaApertura: number | null;
  horaCierre: number | null;
  urlFoto: string | null;
  createdAt: Date;
  updatedAt: Date;
}
