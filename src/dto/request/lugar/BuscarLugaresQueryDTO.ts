import { z } from 'zod';
import type { Bbox } from '../../../entity/Bbox.js';
import { CategoriaLugar } from '../../../enum/CategoriaLugar.js';
import { NivelEfectivo } from '../../../enum/NivelSaturacion.js';
import { textoRequerido } from '../campos.js';

/** ConfiguracionApp.lugares: bounds of `q` and `limite` (LUGARES_* keys). */
export interface LimitesBusquedaLugares {
  qMin: number;
  qMax: number;
  limiteMax: number;
  limiteDefault: number;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;
const MENSAJE_FORMATO = 'Debe tener 4 números separados por comas: minLng,minLat,maxLng,maxLat.';
const LAT_MAX = 90;
const LNG_MAX = 180;

const aBbox = (texto: string): Bbox => {
  const [minLng, minLat, maxLng, maxLat] = texto.split(',').map((parte) => Number(parte.trim())) as [number, number, number, number];
  return { minLng, minLat, maxLng, maxLat };
};

/** `minLng,minLat,maxLng,maxLat` in decimal degrees: four numbers, valid ranges, minimums below maximums. */
export const bboxSchema = z
  .string()
  .refine((texto) => {
    const partes = texto.split(',').map((parte) => parte.trim());
    return partes.length === 4 && partes.every((parte) => DECIMAL.test(parte));
  }, MENSAJE_FORMATO)
  .transform(aBbox)
  .refine((b) => Math.abs(b.minLat) <= LAT_MAX && Math.abs(b.maxLat) <= LAT_MAX, `La latitud debe estar entre -${LAT_MAX} y ${LAT_MAX}.`)
  .refine((b) => Math.abs(b.minLng) <= LNG_MAX && Math.abs(b.maxLng) <= LNG_MAX, `La longitud debe estar entre -${LNG_MAX} y ${LNG_MAX}.`)
  .refine((b) => b.minLng < b.maxLng && b.minLat < b.maxLat, 'Los mínimos deben ser menores que los máximos.');

/**
 * GET /api/lugares query: `q` (`qMin`-`qMax` characters once trimmed) and/or `bbox`; `categoria`, `nivel` and
 * `limite` (1-`limiteMax`, `limiteDefault` when absent) are optional. At least one of `q` and `bbox` is required.
 * The bounds are configuration (ConfiguracionApp.lugares), so the schema is built from them.
 */
export const crearBuscarLugaresQuerySchema = ({ qMin, qMax, limiteMax, limiteDefault }: LimitesBusquedaLugares) =>
  z
    .object({
      q: textoRequerido(qMin, qMax).optional(),
      bbox: bboxSchema.optional(),
      categoria: z.enum(Object.values(CategoriaLugar) as [CategoriaLugar, ...CategoriaLugar[]]).optional(),
      nivel: z.enum(Object.values(NivelEfectivo) as [NivelEfectivo, ...NivelEfectivo[]]).optional(),
      limite: z
        .string()
        .regex(/^\d+$/, 'Debe ser un entero positivo.')
        .transform(Number)
        .pipe(z.number().min(1).max(limiteMax))
        .default(limiteDefault),
    })
    .refine((consulta) => consulta.q !== undefined || consulta.bbox !== undefined, {
      message: 'Indica un texto de búsqueda (q) o el área visible (bbox).',
      path: ['bbox'],
    });

export type BuscarLugaresQueryDTO = z.infer<ReturnType<typeof crearBuscarLugaresQuerySchema>>;
