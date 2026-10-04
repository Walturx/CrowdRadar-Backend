import { NivelEfectivo } from '../enum/NivelSaturacion.js';
import type { Lugar } from './Lugar.js';

/**
 * Level as the API shows it (M2 R4): the stored level while its reading is not older than `vigenteDesde`,
 * SIN_INFORMACION when there is none, it has no timestamp or it is stale. A reading made exactly at
 * `vigenteDesde` is still valid.
 */
export function nivelEfectivo(
  lugar: Pick<Lugar, 'saturacionActual' | 'saturacionActualizadaEn'>,
  vigenteDesde: Date,
): NivelEfectivo {
  const { saturacionActual, saturacionActualizadaEn } = lugar;
  if (!saturacionActual || !saturacionActualizadaEn || saturacionActualizadaEn < vigenteDesde) {
    return NivelEfectivo.SIN_INFORMACION;
  }
  return saturacionActual;
}
