import type {
  CompararResponseDTO,
  HistorialResponseDTO,
  MejorHorarioResponseDTO,
} from '../dto/response/analitica/AnaliticaResponseDTO.js';
import { FiltroDias } from '../enum/FiltroDias.js';
import type { ResultadoComparacion, ResultadoHistorial, ResultadoMejorHorario } from '../service/AnaliticaService.js';

export const MENSAJE_SIN_HISTORIAL = 'No existe información histórica disponible para este lugar.';
export const MENSAJE_SIN_COMPARACION = 'No existen datos suficientes para realizar la comparación.';
export const MENSAJE_SIN_RECOMENDACION = 'No existen datos suficientes para generar la recomendación.';
const MENSAJE_SIN_DIFERENCIAS = 'No hay diferencias notables entre ambos periodos.';

const SUJETO_DE_B: Record<FiltroDias, string> = {
  [FiltroDias.FIN_DE_SEMANA]: 'Los fines de semana',
  [FiltroDias.LABORABLES]: 'Los días laborables',
  [FiltroDias.TODOS]: 'En el periodo B',
};

/** 24 -> 00:00. */
const etiquetaHora = (hora: number) => `${String(hora % 24).padStart(2, '0')}:00`;

function resumenDe({ bandaMayorAfluencia, diasB }: ResultadoComparacion): string {
  if (!bandaMayorAfluencia) return MENSAJE_SIN_DIFERENCIAS;
  const { horaInicio, horaFin } = bandaMayorAfluencia;
  return `${SUJETO_DE_B[diasB]} la afluencia sube entre ${etiquetaHora(horaInicio)} y ${etiquetaHora(horaFin)}.`;
}

/** Pattern: Mapper. Analytics results -> the DTOs the app parses, with the user-facing messages and the summary text. */
export const AnaliticaMapper = {
  aHistorial({ hayDatos, sintetico, puntos }: ResultadoHistorial): HistorialResponseDTO {
    return { puntos, hayDatos, mensaje: hayDatos ? null : MENSAJE_SIN_HISTORIAL, sintetico };
  },

  aComparacion(resultado: ResultadoComparacion): CompararResponseDTO {
    const { suficiente, sintetico, periodoA, periodoB, diferencias } = resultado;
    return {
      periodoA,
      periodoB,
      diferencias,
      resumen: suficiente ? resumenDe(resultado) : null,
      suficiente,
      mensaje: suficiente ? null : MENSAJE_SIN_COMPARACION,
      sintetico,
    };
  },

  aMejorHorario({ hayDatos, sintetico, recomendaciones }: ResultadoMejorHorario): MejorHorarioResponseDTO {
    return { recomendaciones, suficiente: hayDatos, mensaje: hayDatos ? null : MENSAJE_SIN_RECOMENDACION, sintetico };
  },
};
