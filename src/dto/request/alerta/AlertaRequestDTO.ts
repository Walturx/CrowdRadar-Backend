import { z } from 'zod';

/** Largest value of an INTEGER primary key: a bigger id cannot exist and would overflow the column. */
const MAX_ID = 2_147_483_647;
const TAMANO_MAXIMO = 50;
const TAMANO_POR_DEFECTO = 20;

/** GET /api/alertas query: 1-based `page` (default 1) and `size` 1-50 (default 20). */
export const listarAlertasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(MAX_ID).default(1),
  size: z.coerce.number().int().min(1).max(TAMANO_MAXIMO).default(TAMANO_POR_DEFECTO),
});

export type ListarAlertasQueryDTO = z.infer<typeof listarAlertasQuerySchema>;

/** PATCH /api/alertas/:id/leida params. */
export const alertaIdParamsSchema = z.object({
  id: z.coerce.number().int().min(1).max(MAX_ID),
});

export type AlertaIdParamsDTO = z.infer<typeof alertaIdParamsSchema>;
