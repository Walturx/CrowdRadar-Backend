import { z } from 'zod';
import type { OrdenUsuarios } from '../../../dao/UsuarioDAO.js';
import type { DiasSuspension } from '../../../entity/SancionUsuario.js';
import { EstadoCuenta } from '../../../enum/EstadoCuenta.js';
import type { DecisionModeracion } from '../../../facade/ModeracionFacade.js';
import { listarMisReportesSchema } from '../reporte/ListarMisReportesQueryDTO.js';

const ID_MAX = 2_147_483_647; // INTEGER column
export const BUSQUEDA_MIN = 2;
export const BUSQUEDA_MAX = 80;
export const MOTIVO_SUSPENSION_MIN = 10;
export const MOTIVO_SUSPENSION_MAX = 280;
export const COMENTARIO_RESOLUCION_MAX = 280;

const ORDENES = ['RECIENTES', 'NOMBRE', 'KARMA'] as const satisfies readonly OrdenUsuarios[];
const DECISIONES = ['MANTENER', 'ELIMINAR'] as const satisfies readonly DecisionModeracion[];

const idPositivo = z.string().regex(/^\d+$/, 'Debe ser un entero positivo.').transform(Number).pipe(z.number().min(1).max(ID_MAX));

/** `:reporteId` of /api/admin/reportes-denunciados/:reporteId... */
export const reporteDenunciadoParamsSchema = z.object({ reporteId: idPositivo });
export type ReporteDenunciadoParamsDTO = z.infer<typeof reporteDenunciadoParamsSchema>;

/** `:id` of /api/admin/usuarios/:id... */
export const usuarioIdParamsSchema = z.object({ id: idPositivo });
export type UsuarioIdParamsDTO = z.infer<typeof usuarioIdParamsSchema>;

/** POST .../resolucion body: strict; the comment is optional and only logged. */
export const resolverDenunciasSchema = z.strictObject({
  decision: z.enum(DECISIONES),
  comentario: z.string().trim().max(COMENTARIO_RESOLUCION_MAX).nullish(),
});
export type ResolverDenunciasRequestDTO = z.infer<typeof resolverDenunciasSchema>;

/** GET /api/admin/usuarios query: `q` 2-80 characters, `status`, `orden` (default RECIENTES), `page` and `size` 1-50 (20). */
export const listarUsuariosSchema = listarMisReportesSchema.extend({
  q: z.string().trim().min(BUSQUEDA_MIN).max(BUSQUEDA_MAX).optional(),
  status: z.enum(Object.values(EstadoCuenta) as [EstadoCuenta, ...EstadoCuenta[]]).optional(),
  orden: z.enum(ORDENES).default('RECIENTES'),
});
export type ListarUsuariosQueryDTO = z.infer<typeof listarUsuariosSchema>;

/** POST .../suspension body: `dias` must also belong to SUSPENSION_DIAS_PERMITIDOS (the facade checks it). */
export const suspenderUsuarioSchema = z.strictObject({
  dias: z.number().int().transform((d) => d as DiasSuspension),
  motivo: z.string().trim().min(MOTIVO_SUSPENSION_MIN).max(MOTIVO_SUSPENSION_MAX),
});
export type SuspenderUsuarioRequestDTO = z.infer<typeof suspenderUsuarioSchema>;
