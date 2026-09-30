/** Unit tests of inicioDelDiaEn: local midnight of an instant in an IANA zone. */
import { describe, expect, it } from 'vitest';
import { inicioDelDiaEn } from '../../src/util/dia.js';

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
