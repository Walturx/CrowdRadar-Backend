import { z } from 'zod';

/** Largest value of an INTEGER primary key: a bigger id cannot exist and would overflow the column. */
const MAX_ID = 2_147_483_647;

/** POST /api/favoritos body. */
export const agregarFavoritoSchema = z.strictObject({
  lugarId: z.number().int().min(1).max(MAX_ID),
});

export type AgregarFavoritoRequestDTO = z.infer<typeof agregarFavoritoSchema>;

/** PATCH /api/favoritos/:lugarId/alertas body. */
export const configurarAlertasSchema = z.strictObject({
  alertasActivadas: z.boolean(),
});

export type ConfigurarAlertasRequestDTO = z.infer<typeof configurarAlertasSchema>;

/** `:lugarId` of DELETE /api/favoritos/:lugarId and PATCH .../alertas: a positive integer that fits the INTEGER column. */
export const favoritoLugarParamsSchema = z.object({
  lugarId: z
    .string()
    .regex(/^\d+$/, 'Debe ser un entero positivo.')
    .transform(Number)
    .pipe(z.number().min(1).max(MAX_ID)),
});

export type FavoritoLugarParamsDTO = z.infer<typeof favoritoLugarParamsSchema>;
