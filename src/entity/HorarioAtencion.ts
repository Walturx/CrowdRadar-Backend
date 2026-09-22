import type { Lugar } from './Lugar.js';

const MINUTOS_POR_HORA = 60;
const FIN_DEL_DIA = 24;

/** Wall-clock hour (0 <= hora < 24, minutes as a fraction) of an instant in an IANA time zone. */
function horaLocal(ahora: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ahora);
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value);
  return valor('hour') + valor('minute') / MINUTOS_POR_HORA;
}

/**
 * Value object: opening hours of a place as whole hours (`hora_apertura` 0..23, `hora_cierre` 1..24).
 * The place is open from `horaApertura` (inclusive) to `horaCierre` (exclusive); a closing hour smaller than the
 * opening one crosses midnight. 0..24 is always open; opening == closing is an empty window (never open).
 */
export class HorarioAtencion {
  constructor(
    readonly horaApertura: number | null,
    readonly horaCierre: number | null,
  ) {}

  static desde(lugar: Pick<Lugar, 'horaApertura' | 'horaCierre'>): HorarioAtencion {
    return new HorarioAtencion(lugar.horaApertura, lugar.horaCierre);
  }

  /** `null` when the hours are unknown. */
  estaAbierto(ahora: Date, zona: string): boolean | null {
    const { horaApertura: apertura, horaCierre: cierre } = this;
    if (apertura === null || cierre === null) return null;
    if (apertura === 0 && cierre === FIN_DEL_DIA) return true;
    if (apertura === cierre) return false;
    const hora = horaLocal(ahora, zona);
    if (apertura < cierre) return hora >= apertura && hora < cierre;
    return hora >= apertura || hora < cierre;
  }
}
