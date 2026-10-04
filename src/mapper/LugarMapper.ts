import type { LugarDetalleResponseDTO } from '../dto/response/lugar/LugarDetalleResponseDTO.js';
import type { LugarResumenResponseDTO } from '../dto/response/lugar/LugarResumenResponseDTO.js';
import { NivelEfectivo } from '../enum/NivelSaturacion.js';
import type { DetalleLugar, ResultadoBusquedaLugar } from '../service/LugarService.js';

const MENSAJE_LISTA = 'Lugares obtenidos correctamente.';
export const MENSAJE_DETALLE = 'Lugar obtenido correctamente.';
const MENSAJE_SIN_ZONA = 'No hay lugares en esta zona.';
const MENSAJE_SIN_INFORMACION = 'Aún no hay reportes suficientes para determinar la saturación de este lugar.';

/**
 * Pattern: Mapper. The only place that turns places into what leaves over HTTP; fields are listed
 * explicitly so a new column is never exposed by accident.
 */
export const LugarMapper = {
  aResumen({ lugar, nivel }: ResultadoBusquedaLugar): LugarResumenResponseDTO {
    return {
      id: lugar.id,
      nombre: lugar.nombre,
      categoria: lugar.categoria,
      latitud: lugar.latitud,
      longitud: lugar.longitud,
      saturacion: nivel,
    };
  },

  aDetalle({ lugar, nivel, reportesRecientes, abiertoAhora, esFavorito, alertasActivadas }: DetalleLugar): LugarDetalleResponseDTO {
    const sinInformacion = nivel === NivelEfectivo.SIN_INFORMACION;
    return {
      id: lugar.id,
      nombre: lugar.nombre,
      direccion: lugar.direccion,
      categoria: lugar.categoria,
      latitud: lugar.latitud,
      longitud: lugar.longitud,
      horarioAtencion: lugar.horarioAtencion,
      abiertoAhora,
      urlFoto: lugar.urlFoto,
      saturacion: {
        nivel,
        actualizadoEn: sinInformacion ? null : (lugar.saturacionActualizadaEn?.toISOString() ?? null),
        reportesRecientes,
        mensaje: sinInformacion ? MENSAJE_SIN_INFORMACION : null,
      },
      esFavorito,
      alertasActivadas,
    };
  },

  /** Envelope message of the list: an empty result explains itself (HU 3.1, 3.4). */
  mensajeLista(resultados: readonly ResultadoBusquedaLugar[], q: string | undefined): string {
    if (resultados.length > 0) return MENSAJE_LISTA;
    return q === undefined ? MENSAJE_SIN_ZONA : `No encontramos lugares para “${q}”. Prueba con otro nombre.`;
  },
};
