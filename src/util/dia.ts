import { MS_POR_DIA, MS_POR_SEGUNDO } from './tiempo.js';

type Parte = 'hour' | 'minute' | 'second';

/**
 * Start (00:00 local time) of the calendar day that `instante` falls in, in the IANA zone `zona`, as an
 * instant. The offset is read from the zone itself, so it also holds for zones with daylight saving.
 */
export function inicioDelDiaEn(instante: Date, zona: string): Date {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instante)
      .map((parte) => [parte.type, Number(parte.value)]),
  ) as Record<Parte, number>;
  const segundosDelDia = partes.hour * 3600 + partes.minute * 60 + partes.second;
  const milisegundos = instante.getTime() % MS_POR_SEGUNDO;
  return new Date(instante.getTime() - milisegundos - segundosDelDia * MS_POR_SEGUNDO);
}

const FORMATO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar day (YYYY-MM-DD) of an instant in the IANA zone `zona`. */
export function diaDe(instante: Date, zona: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
}

/** Midnight at the start of calendar day `dia` (YYYY-MM-DD) in the zone `zona`, as an instant. Zones within UTC-11..+11. */
export function inicioDelDiaDe(dia: string, zona: string): Date {
  return inicioDelDiaEn(new Date(`${dia}T12:00:00Z`), zona);
}

function aUtc(dia: string): number {
  const [, anio, mes, d] = FORMATO_DIA.exec(dia) ?? [];
  return Date.UTC(Number(anio), Number(mes) - 1, Number(d));
}

/** `dia` (YYYY-MM-DD) moved `n` calendar days; negative goes back. */
export function sumarDias(dia: string, n: number): string {
  return new Date(aUtc(dia) + n * MS_POR_DIA).toISOString().slice(0, 10);
}

/** Calendar days from `desde` to `hasta` (negative when `hasta` is earlier). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_POR_DIA);
}
