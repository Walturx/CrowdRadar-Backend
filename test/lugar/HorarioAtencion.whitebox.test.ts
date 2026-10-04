/**
 * Integrante: M2 (lugares y busqueda)
 * Tecnica: caja blanca, cobertura de ramas / caminos independientes
 * Metodo: HorarioAtencion.estaAbierto(ahora, zona)
 * Complejidad ciclomatica: CC = 9 (8 decisiones + 1):
 *   1-2. apertura nula O cierre nulo  3-4. apertura 0 Y cierre 24  5. apertura == cierre
 *   6-7. apertura < cierre (rango normal) con hora >= apertura Y hora < cierre
 *   8. rango que cruza medianoche: hora >= apertura O hora < cierre
 * Caminos: horas nulas, 0-24, rango normal (antes / borde de apertura / dentro / borde de cierre / despues),
 * cierre 24, cruce de medianoche (antes / despues / madrugada / borde de cierre), apertura == cierre, zona.
 */
import { describe, expect, it } from 'vitest';
import { HorarioAtencion } from '../../src/entity/HorarioAtencion.js';
import type { Lugar } from '../../src/entity/Lugar.js';

const LIMA = 'America/Lima';
/** An instant at hh:mm Lima time (UTC-5, no daylight saving) on 2026-10-05. */
const limaA = (hh: number, mm = 0) => new Date(Date.UTC(2026, 9, 5, hh + 5, mm));
const abiertoA = (apertura: number | null, cierre: number | null, ahora: Date, zona = LIMA) =>
  new HorarioAtencion(apertura, cierre).estaAbierto(ahora, zona);

describe('HorarioAtencion.estaAbierto', () => {
  describe('horas desconocidas', () => {
    it.each([
      ['sin apertura', null, 20],
      ['sin cierre', 8, null],
      ['sin ninguna', null, null],
    ])('%s devuelve null (se desconoce)', (_caso, apertura, cierre) => {
      expect(abiertoA(apertura, cierre, limaA(12))).toBeNull();
    });
  });

  describe('0-24 (siempre abierto)', () => {
    it.each([[0, 0], [3, 0], [12, 0], [23, 59]])('abierto a las %i:%i', (hh, mm) => {
      expect(abiertoA(0, 24, limaA(hh, mm))).toBe(true);
    });
  });

  describe('rango normal 8-20', () => {
    it.each([
      ['un minuto antes de abrir', limaA(7, 59), false],
      ['justo a la apertura', limaA(8), true],
      ['dentro', limaA(12, 30), true],
      ['un minuto antes del cierre', limaA(19, 59), true],
      ['justo al cierre', limaA(20), false],
      ['despues del cierre', limaA(22), false],
    ])('%s', (_caso, ahora, esperado) => {
      expect(abiertoA(8, 20, ahora)).toBe(esperado);
    });
  });

  describe('cierre 24 con apertura distinta de 0', () => {
    it('abierto hasta el ultimo minuto del dia y cerrado antes de la apertura', () => {
      expect(abiertoA(8, 24, limaA(23, 59))).toBe(true);
      expect(abiertoA(8, 24, limaA(7, 0))).toBe(false);
    });
  });

  describe('rango que cruza la medianoche 20-4', () => {
    it.each([
      ['antes de abrir', limaA(19, 59), false],
      ['justo a la apertura', limaA(20), true],
      ['antes de medianoche', limaA(23, 30), true],
      ['despues de medianoche', limaA(0, 30), true],
      ['un minuto antes del cierre', limaA(3, 59), true],
      ['justo al cierre', limaA(4), false],
      ['a mediodia', limaA(12), false],
    ])('%s', (_caso, ahora, esperado) => {
      expect(abiertoA(20, 4, ahora)).toBe(esperado);
    });
  });

  describe('apertura == cierre', () => {
    it('es una ventana vacia: nunca esta abierto', () => {
      expect(abiertoA(8, 8, limaA(8))).toBe(false);
      expect(abiertoA(8, 8, limaA(12))).toBe(false);
    });
  });

  describe('zona horaria', () => {
    it('la misma hora UTC cae en horas distintas segun la zona', () => {
      const instante = new Date('2026-10-05T13:30:00Z');
      expect(abiertoA(9, 20, instante, 'UTC')).toBe(true);
      expect(abiertoA(9, 20, instante, LIMA)).toBe(false);
    });
  });

  describe('desde(lugar)', () => {
    it('toma las horas del lugar', () => {
      const lugar = { horaApertura: 8, horaCierre: 20 } as Pick<Lugar, 'horaApertura' | 'horaCierre'>;
      expect(HorarioAtencion.desde(lugar).estaAbierto(limaA(9), LIMA)).toBe(true);
      expect(HorarioAtencion.desde({ horaApertura: null, horaCierre: null }).estaAbierto(limaA(9), LIMA)).toBeNull();
    });
  });
});
