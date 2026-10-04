import type { NivelSaturacion } from '../../../enum/NivelSaturacion.js';

/** data of GET /api/lugares/:id/historial. */
export interface HistorialResponseDTO {
  puntos: { etiqueta: string; valor: number; muestras: number }[];
  hayDatos: boolean;
  /** Why there is nothing to show; null when there is data. */
  mensaje: string | null;
  /** True when the data comes from the demo users, so the app can say so. */
  sintetico: boolean;
}

/** data of GET /api/lugares/:id/comparar. */
export interface CompararResponseDTO {
  periodoA: { hora: number; valor: number; muestras: number }[];
  periodoB: { hora: number; valor: number; muestras: number }[];
  diferencias: { hora: number; diferencia: number }[];
  resumen: string | null;
  suficiente: boolean;
  mensaje: string | null;
  sintetico: boolean;
}

/** data of GET /api/lugares/:id/mejor-horario. */
export interface MejorHorarioResponseDTO {
  recomendaciones: { horaInicio: number; horaFin: number; nivel: NivelSaturacion; promedio: number; muestras: number }[];
  suficiente: boolean;
  mensaje: string | null;
  sintetico: boolean;
}
