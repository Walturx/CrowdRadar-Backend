import { z } from 'zod';
import { NivelSaturacion } from '../../../enum/NivelSaturacion.js';

/** POST /api/reportes body: strict, so a stray key (e.g. a comment nobody stores) is rejected by name. */
export const crearReporteSchema = z.strictObject({
  lugarId: z.number().int().positive(),
  nivel: z.enum(Object.values(NivelSaturacion) as [NivelSaturacion, ...NivelSaturacion[]]),
});

export type CrearReporteRequestDTO = z.infer<typeof crearReporteSchema>;
