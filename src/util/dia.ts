const MS_POR_SEGUNDO = 1000;

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
