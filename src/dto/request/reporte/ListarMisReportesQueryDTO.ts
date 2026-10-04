import { z } from 'zod';

export const TAMANO_PAGINA_DEFECTO = 20;
export const TAMANO_PAGINA_MAXIMO = 50;

/** GET /api/reportes/mios query: 1-based `page`, `size` 1..50 (default 20). Anything else is a 400. */
export const listarMisReportesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(TAMANO_PAGINA_MAXIMO).default(TAMANO_PAGINA_DEFECTO),
});

export type ListarMisReportesQueryDTO = z.infer<typeof listarMisReportesSchema>;
