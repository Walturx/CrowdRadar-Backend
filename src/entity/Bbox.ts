/**
 * Bounding box in decimal degrees; edges are inclusive. `minLng < maxLng` and `minLat < maxLat` always hold: a box that
 * crosses the antimeridian is not supported (the API rejects it; Lima is nowhere near it).
 */
export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}
