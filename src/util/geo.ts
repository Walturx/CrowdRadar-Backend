import type { Bbox } from '../entity/Bbox.js';

export interface Punto {
  lat: number;
  lng: number;
}

const RADIO_TIERRA_M = 6_371_000;
const METROS_POR_GRADO = (Math.PI / 180) * RADIO_TIERRA_M;
const LAT_MAX = 90;
const LNG_MAX = 180;
/** Keeps the longitude span finite near the poles (cos tends to 0 there). */
const COS_MINIMO = 1e-6;

const aRadianes = (grados: number) => (grados * Math.PI) / 180;

/** Great-circle distance in metres between two points (haversine). */
export function distanciaMetros(a: Punto, b: Punto): number {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Smallest box that contains every point within `radioKm` of `centro`: a cheap pre-filter for the database, the
 * exact radius is checked with `distanciaMetros`. Clamped to valid coordinates, so `min < max` always holds.
 */
export function bboxAlrededor(centro: Punto, radioKm: number): Bbox {
  const metros = radioKm * 1000;
  const deltaLat = metros / METROS_POR_GRADO;
  const minLat = Math.max(-LAT_MAX, centro.lat - deltaLat);
  const maxLat = Math.min(LAT_MAX, centro.lat + deltaLat);
  // The parallels are shortest at the pole-most edge, where the same distance spans the most degrees.
  const cosLatPeor = Math.max(COS_MINIMO, Math.cos(aRadianes(Math.min(LAT_MAX, Math.abs(centro.lat) + deltaLat))));
  const deltaLng = metros / (METROS_POR_GRADO * cosLatPeor);
  return {
    minLng: Math.max(-LNG_MAX, centro.lng - deltaLng),
    minLat,
    maxLng: Math.min(LNG_MAX, centro.lng + deltaLng),
    maxLat,
  };
}
