import { z } from 'zod';
import { CategoriaLugar } from '../../../enum/CategoriaLugar.js';
import { NivelEfectivo } from '../../../enum/NivelSaturacion.js';
import type { LimitesBusquedaLugares } from './BuscarLugaresQueryDTO.js';

const DECIMAL = /^-?\d+(\.\d+)?$/;
const MENSAJE_DECIMAL = 'Debe ser un número decimal.';
const LAT_MAX = 90;
const LNG_MAX = 180;
const RADIO_MIN_KM = 0.1;
const RADIO_MAX_KM = 20;

const decimal = (min: number, max: number) =>
  z.string().regex(DECIMAL, MENSAJE_DECIMAL).transform(Number).pipe(z.number().min(min).max(max));

/**
 * GET /api/lugares/explorar query: every criterion is optional and they combine with AND. `lat` and `lng` go
 * together; `radioKm` (0.1-20, `radioPorDefectoKm` when absent) only matters with them. `limite` is 1-`limiteMax`
 * (`limiteDefault` when absent). Unknown keys are ignored, as in GET /api/lugares.
 */
export const crearExplorarLugaresQuerySchema = (
  { limiteMax, limiteDefault }: Pick<LimitesBusquedaLugares, 'limiteMax' | 'limiteDefault'>,
  radioPorDefectoKm: number,
) =>
  z
    .object({
      categoria: z.enum(Object.values(CategoriaLugar) as [CategoriaLugar, ...CategoriaLugar[]]).optional(),
      saturacion: z.enum(Object.values(NivelEfectivo) as [NivelEfectivo, ...NivelEfectivo[]]).optional(),
      lat: decimal(-LAT_MAX, LAT_MAX).optional(),
      lng: decimal(-LNG_MAX, LNG_MAX).optional(),
      radioKm: decimal(RADIO_MIN_KM, RADIO_MAX_KM).default(radioPorDefectoKm),
      limite: z
        .string()
        .regex(/^\d+$/, 'Debe ser un entero positivo.')
        .transform(Number)
        .pipe(z.number().min(1).max(limiteMax))
        .default(limiteDefault),
    })
    .superRefine((consulta, ctx) => {
      if ((consulta.lat === undefined) !== (consulta.lng === undefined)) {
        ctx.addIssue({
          code: 'custom',
          path: [consulta.lat === undefined ? 'lat' : 'lng'],
          message: 'lat y lng deben enviarse juntos.',
        });
      }
    });

export type ExplorarLugaresQueryDTO = z.infer<ReturnType<typeof crearExplorarLugaresQuerySchema>>;
