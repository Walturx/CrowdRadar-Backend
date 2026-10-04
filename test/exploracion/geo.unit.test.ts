/**
 * Integrante: stream M3 (exploracion)
 * Tecnica: caja negra (valores conocidos, simetria, limites de latitud y longitud)
 * Metodo: util/geo distanciaMetros / bboxAlrededor (spec M3 explorar, design 4.3)
 */
import { describe, expect, it } from 'vitest';
import { bboxAlrededor, distanciaMetros } from '../../src/util/geo.js';

describe('distanciaMetros (haversine)', () => {
  it('el mismo punto esta a 0 m', () => {
    expect(distanciaMetros({ lat: -12.12, lng: -77.03 }, { lat: -12.12, lng: -77.03 })).toBe(0);
  });

  it('un grado de latitud mide unos 111.2 km', () => {
    expect(distanciaMetros({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
  });

  it('Parque Kennedy a Plaza de Armas de Lima ronda los 8.4 km y es simetrica', () => {
    const kennedy = { lat: -12.1219, lng: -77.0297 };
    const plaza = { lat: -12.0464, lng: -77.0306 };
    const ida = distanciaMetros(kennedy, plaza);
    expect(ida).toBeGreaterThan(8_300);
    expect(ida).toBeLessThan(8_500);
    expect(distanciaMetros(plaza, kennedy)).toBeCloseTo(ida, 6);
  });
});

describe('bboxAlrededor', () => {
  it('contiene el punto a radioKm hacia los cuatro lados', () => {
    const centro = { lat: -12.1, lng: -77.03 };
    const caja = bboxAlrededor(centro, 2);
    for (const punto of [
      { lat: centro.lat + 0.0179, lng: centro.lng },
      { lat: centro.lat - 0.0179, lng: centro.lng },
      { lat: centro.lat, lng: centro.lng + 0.0183 },
      { lat: centro.lat, lng: centro.lng - 0.0183 },
    ]) {
      expect(punto.lat).toBeGreaterThanOrEqual(caja.minLat);
      expect(punto.lat).toBeLessThanOrEqual(caja.maxLat);
      expect(punto.lng).toBeGreaterThanOrEqual(caja.minLng);
      expect(punto.lng).toBeLessThanOrEqual(caja.maxLng);
    }
  });

  it('nunca sale de los rangos validos ni invierte minimos y maximos cerca de los polos y del antimeridiano', () => {
    for (const centro of [
      { lat: 89.99, lng: 179.99 },
      { lat: -89.99, lng: -179.99 },
      { lat: 90, lng: 0 },
    ]) {
      const caja = bboxAlrededor(centro, 20);
      expect(caja.minLat).toBeGreaterThanOrEqual(-90);
      expect(caja.maxLat).toBeLessThanOrEqual(90);
      expect(caja.minLng).toBeGreaterThanOrEqual(-180);
      expect(caja.maxLng).toBeLessThanOrEqual(180);
      expect(caja.minLat).toBeLessThan(caja.maxLat);
      expect(caja.minLng).toBeLessThan(caja.maxLng);
    }
  });
});
