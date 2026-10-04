/**
 * One-off export of the Lima places seed from OpenStreetMap (Overpass API). Run it by hand, never at runtime
 * or in tests: `npx tsx scripts/exportar-lugares-osm.ts`. It looks up the curated SELECCION below and rewrites
 * database/data/lugares-lima.json. Data: (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
 * Lima bounding box (south, west, north, east): -12.25,-77.20,-11.85,-76.85.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type TipoOsm = 'node' | 'way' | 'relation';

export interface SeleccionLugar {
  osmTipo: TipoOsm;
  osmId: number;
  categoria: string;
  distrito: string;
  /** Replaces the OSM name when it has a typo. */
  nombre?: string;
}

export interface ElementoOsm {
  type: TipoOsm;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

const DECIMALES = 6;
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const SALIDA = resolve(import.meta.dirname, '..', 'database', 'data', 'lugares-lima.json');

const lugar = (osmTipo: TipoOsm, osmId: number, categoria: string, distrito: string): SeleccionLugar => ({
  osmTipo,
  osmId,
  categoria,
  distrito,
});

/** Curated places: at least 5 per category and 8 districts. */
export const SELECCION: readonly SeleccionLugar[] = [
  lugar('relation', 3570374, 'PARQUE', 'San Isidro'),
  lugar('way', 28798160, 'PARQUE', 'Miraflores'),
  lugar('way', 28798174, 'PARQUE', 'Miraflores'),
  lugar('way', 318334704, 'PARQUE', 'Santiago de Surco'),
  lugar('way', 39413088, 'PARQUE', 'Cercado de Lima'),
  lugar('relation', 12175742, 'PARQUE', 'Cercado de Lima'),
  lugar('way', 44364384, 'PARQUE', 'Cercado de Lima'),
  lugar('way', 172243636, 'PARQUE', 'Cercado de Lima'),
  lugar('way', 28993402, 'CENTRO_COMERCIAL', 'Miraflores'),
  lugar('node', 1278915822, 'CENTRO_COMERCIAL', 'Cercado de Lima'),
  lugar('node', 4311948389, 'CENTRO_COMERCIAL', 'Bellavista'),
  lugar('node', 4411814464, 'CENTRO_COMERCIAL', 'La Victoria'),
  lugar('node', 2670622746, 'CENTRO_COMERCIAL', 'Miraflores'),
  lugar('node', 4343120772, 'CENTRO_COMERCIAL', 'Miraflores'),
  lugar('node', 4029952258, 'CENTRO_COMERCIAL', 'Rímac'),
  lugar('node', 4119559799, 'MERCADO', 'Cercado de Lima'),
  lugar('node', 4780235064, 'MERCADO', 'Cercado de Lima'),
  lugar('node', 4139070892, 'MERCADO', 'La Victoria'),
  lugar('node', 4077383012, 'MERCADO', 'San Isidro'),
  lugar('node', 4597434109, 'MERCADO', 'Miraflores'),
  lugar('node', 3010730359, 'MERCADO', 'Santa Anita'),
  lugar('node', 5322983139, 'MERCADO', 'Rímac'),
  lugar('node', 1418823155, 'TRANSPORTE', 'Cercado de Lima'),
  lugar('node', 1418822748, 'TRANSPORTE', 'Cercado de Lima'),
  lugar('node', 1418824475, 'TRANSPORTE', 'La Victoria'),
  lugar('node', 1418824477, 'TRANSPORTE', 'La Victoria'),
  lugar('node', 1418826609, 'TRANSPORTE', 'Rímac'),
  lugar('node', 1418826159, 'TRANSPORTE', 'Barranco'),
  lugar('node', 1418826163, 'TRANSPORTE', 'Chorrillos'),
  lugar('node', 1278915817, 'TRANSPORTE', 'Cercado de Lima'),
  lugar('way', 44364378, 'PLAZA', 'Cercado de Lima'),
  lugar('way', 172097116, 'PLAZA', 'Cercado de Lima'),
  lugar('way', 676915917, 'PLAZA', 'Cercado de Lima'),
  lugar('way', 194875166, 'PLAZA', 'Cercado de Lima'),
  { ...lugar('way', 293642352, 'PLAZA', 'Rímac'), nombre: 'Plaza de Armas del Rímac' },
  lugar('node', 5694077424, 'PLAZA', 'La Victoria'),
  lugar('way', 194875167, 'PLAZA', 'Pueblo Libre'),
  lugar('way', 396258998, 'PLAYA', 'Miraflores'),
  lugar('way', 396258999, 'PLAYA', 'Miraflores'),
  lugar('way', 396259001, 'PLAYA', 'Miraflores'),
  lugar('way', 1314528583, 'PLAYA', 'Barranco'),
  lugar('way', 396255683, 'PLAYA', 'Barranco'),
  lugar('way', 298016070, 'PLAYA', 'Chorrillos'),
  lugar('way', 298016072, 'PLAYA', 'Chorrillos'),
  lugar('way', 165080724, 'PLAYA', 'Chorrillos'),
];

/** One Overpass query for every selected id, grouped by element type. */
export function consultaOverpass(seleccion: readonly SeleccionLugar[]): string {
  const tipos: TipoOsm[] = ['node', 'way', 'relation'];
  const partes = tipos.flatMap((tipo) => {
    const ids = seleccion.filter((s) => s.osmTipo === tipo).map((s) => s.osmId);
    return ids.length > 0 ? [`${tipo}(id:${ids.join(',')});`] : [];
  });
  return `[out:json][timeout:60];(${partes.join('')});out center tags;`;
}

const redondear = (valor: number) => Number(valor.toFixed(DECIMALES));

/** Seed row of an OSM element: name from the tags, coordinates of the node or the centre of a way/relation. */
export function aFilaSemilla(elemento: ElementoOsm, seleccion: SeleccionLugar) {
  const nombre = seleccion.nombre ?? elemento.tags.name?.trim();
  if (!nombre) throw new Error(`${seleccion.osmTipo}/${seleccion.osmId} no tiene nombre`);
  const latitud = elemento.lat ?? elemento.center?.lat;
  const longitud = elemento.lon ?? elemento.center?.lon;
  if (latitud === undefined || longitud === undefined) {
    throw new Error(`${seleccion.osmTipo}/${seleccion.osmId} no tiene coordenadas`);
  }
  return {
    osmTipo: seleccion.osmTipo,
    osmId: seleccion.osmId,
    nombre,
    direccion: `${seleccion.distrito}, Lima`,
    latitud: redondear(latitud),
    longitud: redondear(longitud),
    categoria: seleccion.categoria,
  };
}

async function exportar(): Promise<void> {
  const respuesta = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'crowdradar-student-project/1.0' },
    body: new URLSearchParams({ data: consultaOverpass(SELECCION) }),
  });
  if (!respuesta.ok) throw new Error(`Overpass respondio ${respuesta.status}`);
  const { elements } = (await respuesta.json()) as { elements: ElementoOsm[] };
  const filas = SELECCION.map((seleccion) => {
    const elemento = elements.find((e) => e.type === seleccion.osmTipo && e.id === seleccion.osmId);
    if (!elemento) throw new Error(`${seleccion.osmTipo}/${seleccion.osmId} no existe en OpenStreetMap`);
    return aFilaSemilla(elemento, seleccion);
  });
  writeFileSync(SALIDA, `${JSON.stringify(filas, null, 2)}\n`, 'utf8');
  process.stdout.write(`${filas.length} lugares escritos en ${SALIDA}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  exportar().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
