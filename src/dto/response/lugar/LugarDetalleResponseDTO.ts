import type { CategoriaLugar } from '../../../enum/CategoriaLugar.js';
import type { NivelEfectivo } from '../../../enum/NivelSaturacion.js';

/** Saturation block of the detail (D-4: an object here, a string on the list). */
export interface SaturacionLugarResponseDTO {
  nivel: NivelEfectivo;
  /** ISO instant of the reading, null when the level is SIN_INFORMACION. */
  actualizadoEn: string | null;
  reportesRecientes: number;
  /** Explanation shown for SIN_INFORMACION, null otherwise. */
  mensaje: string | null;
}

/** `data` of GET /api/lugares/:id. */
export interface LugarDetalleResponseDTO {
  id: number;
  nombre: string;
  direccion: string | null;
  categoria: CategoriaLugar;
  latitud: number;
  longitud: number;
  horarioAtencion: string | null;
  /** null when the opening hours are unknown. */
  abiertoAhora: boolean | null;
  urlFoto: string | null;
  saturacion: SaturacionLugarResponseDTO;
  esFavorito: boolean;
  alertasActivadas: boolean;
}
