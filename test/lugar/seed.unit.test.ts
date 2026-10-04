/**
 * Shape of the 45 Lima places seed (no database). Spec M2 R5, S15: 45 rows, at least 5 per category,
 * 6 categories, at least 8 districts, unique (osmTipo, osmId), coordinates inside the Lima bbox.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CategoriaLugar } from '../../src/enum/CategoriaLugar.js';

interface LugarSemilla {
  osmTipo: string;
  osmId: number;
  nombre: string;
  direccion: string;
  latitud: number;
  longitud: number;
  categoria: string;
}

const TIPOS_OSM = ['node', 'way', 'relation'];
const [SUR, OESTE, NORTE, ESTE] = [-12.25, -77.2, -11.85, -76.85];
const lugares: LugarSemilla[] = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', '..', 'database', 'data', 'lugares-lima.json'), 'utf8'),
);
const categorias = Object.values(CategoriaLugar);
const distritoDe = (lugar: LugarSemilla) => lugar.direccion.split(',')[0]!.trim();

describe('database/data/lugares-lima.json (M2 seed)', () => {
  it('tiene exactamente 45 lugares', () => {
    expect(lugares).toHaveLength(45);
  });

  it('cubre las 6 categorias con al menos 5 lugares cada una', () => {
    expect(categorias).toHaveLength(6);
    for (const categoria of categorias) {
      expect(lugares.filter((l) => l.categoria === categoria).length, categoria).toBeGreaterThanOrEqual(5);
    }
    expect(lugares.every((l) => categorias.includes(l.categoria as never))).toBe(true);
  });

  it('osmTipo valido y (osmTipo, osmId) unico; osmId solo puede repetirse con otro tipo', () => {
    for (const lugar of lugares) {
      expect(TIPOS_OSM, lugar.nombre).toContain(lugar.osmTipo);
      expect(Number.isInteger(lugar.osmId) && lugar.osmId > 0, lugar.nombre).toBe(true);
    }
    expect(new Set(lugares.map((l) => `${l.osmTipo}/${l.osmId}`)).size).toBe(45);
  });

  it('todas las coordenadas caen dentro del bbox de Lima', () => {
    for (const lugar of lugares) {
      expect(lugar.latitud, lugar.nombre).toBeGreaterThan(SUR);
      expect(lugar.latitud, lugar.nombre).toBeLessThan(NORTE);
      expect(lugar.longitud, lugar.nombre).toBeGreaterThan(OESTE);
      expect(lugar.longitud, lugar.nombre).toBeLessThan(ESTE);
    }
  });

  it('nombres no vacios (max 120) y direccion con el distrito; al menos 8 distritos', () => {
    for (const lugar of lugares) {
      expect(lugar.nombre.trim().length, lugar.osmId.toString()).toBeGreaterThan(0);
      expect(lugar.nombre.length).toBeLessThanOrEqual(120);
      expect(lugar.direccion.length).toBeLessThanOrEqual(200);
      expect(distritoDe(lugar).length, lugar.nombre).toBeGreaterThan(0);
    }
    expect(new Set(lugares.map(distritoDe)).size).toBeGreaterThanOrEqual(8);
  });
});
