/** Shape of the committed Lima places seed data (no database needed). Spec: R-A9.3. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface LugarSemilla {
  osmId: number;
  nombre: string;
  direccion: string | null;
  latitud: number;
  longitud: number;
  categoria: string;
}

const CATEGORIAS = ['PARQUE', 'CENTRO_COMERCIAL', 'MERCADO', 'TRANSPORTE', 'PLAZA', 'PLAYA'];
// Lima bounding box from the design (south, west, north, east).
const [SUR, OESTE, NORTE, ESTE] = [-12.25, -77.2, -11.85, -76.85];

const lugares: LugarSemilla[] = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', '..', 'database', 'data', 'lugares-lima.json'), 'utf8'),
);

describe('database/data/lugares-lima.json', () => {
  it('tiene al menos un lugar por cada una de las 6 categorias', () => {
    expect(lugares.length).toBeGreaterThanOrEqual(CATEGORIAS.length);
    for (const categoria of CATEGORIAS) {
      expect(
        lugares.filter((lugar) => lugar.categoria === categoria).length,
        categoria,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('solo usa categorias validas, osmId unicos y nombres no vacios', () => {
    expect(lugares.length).toBeGreaterThan(0);
    for (const lugar of lugares) {
      expect(CATEGORIAS).toContain(lugar.categoria);
      expect(Number.isInteger(lugar.osmId) && lugar.osmId > 0, lugar.nombre).toBe(true);
      expect(lugar.nombre.trim().length).toBeGreaterThan(0);
      expect(lugar.nombre.length).toBeLessThanOrEqual(120);
    }
    expect(new Set(lugares.map((lugar) => lugar.osmId)).size).toBe(lugares.length);
  });

  it('todas las coordenadas caen dentro del bbox de Lima', () => {
    expect(lugares.length).toBeGreaterThan(0);
    for (const lugar of lugares) {
      expect(lugar.latitud, lugar.nombre).toBeGreaterThan(SUR);
      expect(lugar.latitud, lugar.nombre).toBeLessThan(NORTE);
      expect(lugar.longitud, lugar.nombre).toBeGreaterThan(OESTE);
      expect(lugar.longitud, lugar.nombre).toBeLessThan(ESTE);
    }
  });
});
