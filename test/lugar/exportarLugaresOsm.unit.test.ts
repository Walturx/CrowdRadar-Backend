/** Pure parts of scripts/exportar-lugares-osm.ts (the Overpass call itself is never run by the tests). */
import { describe, expect, it } from 'vitest';
import { aFilaSemilla, consultaOverpass, SELECCION, type ElementoOsm } from '../../scripts/exportar-lugares-osm.js';

describe('aFilaSemilla', () => {
  it('toma coordenadas de un nodo y arma la direccion con el distrito curado', () => {
    const nodo: ElementoOsm = { type: 'node', id: 7, lat: -12.1218, lon: -77.0305, tags: { name: ' Parque Kennedy ' } };
    expect(aFilaSemilla(nodo, { osmTipo: 'node', osmId: 7, categoria: 'PARQUE', distrito: 'Miraflores' })).toEqual({
      osmTipo: 'node',
      osmId: 7,
      nombre: 'Parque Kennedy',
      direccion: 'Miraflores, Lima',
      latitud: -12.1218,
      longitud: -77.0305,
      categoria: 'PARQUE',
    });
  });

  it('usa el centro de una via o relacion y redondea a 6 decimales', () => {
    const via: ElementoOsm = { type: 'way', id: 9, center: { lat: -12.12345678, lon: -77.03456789 }, tags: { name: 'Playa Makaha' } };
    expect(aFilaSemilla(via, { osmTipo: 'way', osmId: 9, categoria: 'PLAYA', distrito: 'Miraflores' })).toMatchObject({
      osmTipo: 'way',
      latitud: -12.123457,
      longitud: -77.034568,
    });
  });

  it('falla si el elemento no trae nombre o coordenadas', () => {
    const sel = { osmTipo: 'node', osmId: 1, categoria: 'PLAZA', distrito: 'Lima' } as const;
    expect(() => aFilaSemilla({ type: 'node', id: 1, lat: 1, lon: 1, tags: {} }, sel)).toThrow(/nombre/);
    expect(() => aFilaSemilla({ type: 'node', id: 1, tags: { name: 'X' } }, sel)).toThrow(/coordenadas/);
  });
});

describe('consultaOverpass / SELECCION', () => {
  it('agrupa los ids por tipo OSM en una sola consulta', () => {
    const consulta = consultaOverpass([
      { osmTipo: 'node', osmId: 1, categoria: 'PLAZA', distrito: 'A' },
      { osmTipo: 'way', osmId: 2, categoria: 'PLAZA', distrito: 'A' },
      { osmTipo: 'node', osmId: 3, categoria: 'PLAZA', distrito: 'A' },
    ]);
    expect(consulta).toContain('node(id:1,3);');
    expect(consulta).toContain('way(id:2);');
    expect(consulta).not.toContain('relation(');
    expect(consulta).toContain('out center tags;');
  });

  it('la seleccion curada tiene 45 lugares unicos', () => {
    expect(SELECCION).toHaveLength(45);
    expect(new Set(SELECCION.map((s) => `${s.osmTipo}/${s.osmId}`)).size).toBe(45);
  });
});
