import { z } from 'zod';

const ID_MAX = 2_147_483_647; // INTEGER column

/** `:id` of /api/lugares/:id: a positive integer that fits the INTEGER column. */
export const lugarIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'Debe ser un entero positivo.')
    .transform(Number)
    .pipe(z.number().min(1).max(ID_MAX)),
});

export type LugarIdParamsDTO = z.infer<typeof lugarIdParamsSchema>;
