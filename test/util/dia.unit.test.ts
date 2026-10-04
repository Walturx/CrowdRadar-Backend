/** Unit tests of inicioDelDiaEn: local midnight of an instant in an IANA zone. */
import { describe, expect, it } from 'vitest';
import { diaDe, diasEntre, inicioDelDiaDe, inicioDelDiaEn, sumarDias } from '../../src/util/dia.js';

describe('inicioDelDiaEn', () => {
  it('Lima (UTC-5): 20:00 local cae en el dia que empezo a las 05:00Z', () => {
    expect(inicioDelDiaEn(new Date('2026-10-06T01:00:00Z'), 'America/Lima')).toEqual(new Date('2026-10-05T05:00:00Z'));
  });

  it('Lima: 00:00 local exacto es su propio inicio y un milisegundo antes es del dia anterior', () => {
    expect(inicioDelDiaEn(new Date('2026-10-06T05:00:00Z'), 'America/Lima')).toEqual(new Date('2026-10-06T05:00:00Z'));
    expect(inicioDelDiaEn(new Date('2026-10-06T04:59:59.999Z'), 'America/Lima')).toEqual(new Date('2026-10-05T05:00:00Z'));
  });

  it('conserva los milisegundos del instante sin desplazar el resultado', () => {
    expect(inicioDelDiaEn(new Date('2026-10-05T15:30:45.678Z'), 'America/Lima')).toEqual(new Date('2026-10-05T05:00:00Z'));
  });

  it('UTC y una zona al este (Tokyo, UTC+9) dan inicios distintos para el mismo instante', () => {
    const instante = new Date('2026-10-05T20:00:00Z');
    expect(inicioDelDiaEn(instante, 'UTC')).toEqual(new Date('2026-10-05T00:00:00Z'));
    expect(inicioDelDiaEn(instante, 'Asia/Tokyo')).toEqual(new Date('2026-10-05T15:00:00Z'));
  });
});

describe('diaDe', () => {
  it('Lima: 23:30 local sigue en su dia aunque en UTC ya sea el siguiente', () => {
    expect(diaDe(new Date('2026-10-06T04:30:00Z'), 'America/Lima')).toBe('2026-10-05');
  });

  it('Lima: 00:00 local exacto abre el dia nuevo y una zona al este lo ve distinto', () => {
    expect(diaDe(new Date('2026-10-06T05:00:00Z'), 'America/Lima')).toBe('2026-10-06');
    expect(diaDe(new Date('2026-10-05T20:00:00Z'), 'Asia/Tokyo')).toBe('2026-10-06');
  });
});

describe('inicioDelDiaDe', () => {
  it('Lima: el dia calendario empieza a las 05:00Z', () => {
    expect(inicioDelDiaDe('2026-10-05', 'America/Lima')).toEqual(new Date('2026-10-05T05:00:00Z'));
  });

  it('Tokyo (UTC+9): el mismo dia empieza el dia anterior a las 15:00Z', () => {
    expect(inicioDelDiaDe('2026-10-05', 'Asia/Tokyo')).toEqual(new Date('2026-10-04T15:00:00Z'));
  });
});

describe('sumarDias / diasEntre', () => {
  it('suma dias cruzando mes y anio, tambien hacia atras', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
    expect(sumarDias('2026-10-05', 0)).toBe('2026-10-05');
  });

  it('cuenta dias entre dos fechas, con signo, incluso en anio bisiesto', () => {
    expect(diasEntre('2026-10-05', '2026-10-12')).toBe(7);
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2);
    expect(diasEntre('2026-10-12', '2026-10-05')).toBe(-7);
    expect(diasEntre('2026-10-05', '2026-10-05')).toBe(0);
  });
});
