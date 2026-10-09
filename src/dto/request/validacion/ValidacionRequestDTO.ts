import { z } from 'zod';
import { MotivoDenuncia } from '../../../enum/MotivoDenuncia.js';
import { TipoAccionValidacion } from '../../../enum/TipoAccionValidacion.js';

const ID_MAX = 2_147_483_647; // INTEGER column
const DECIMAL = /^-?\d+(\.\d+)?$/;
const ENTERO = /^\d+$/;
const LAT_MAX = 90;
const LNG_MAX = 180;
const RADIO_MIN_KM = 0.1;
const RADIO_MAX_KM = 20;
const HORAS_MAX = 24;
export const DETALLE_DENUNCIA_MAX = 280;
export const TAMANO_PAGINA_PENDIENTES_MAX = 50;
export const TAMANO_PAGINA_PENDIENTES_DEFECTO = 20;

const decimal = (min: number, max: number) =>
  z.string().regex(DECIMAL, 'Debe ser un número decimal.').transform(Number).pipe(z.number().min(min).max(max));
const entero = (min: number, max: number) =>
  z.string().regex(ENTERO, 'Debe ser un entero positivo.').transform(Number).pipe(z.number().min(min).max(max));

/** `:id` of /api/reportes/:id...: a positive integer that fits the INTEGER column. */
export const reporteIdParamsSchema = z.object({ id: entero(1, ID_MAX) });
export type ReporteIdParamsDTO = z.infer<typeof reporteIdParamsSchema>;

/** POST /api/reportes/:id/validaciones body: strict, so a stray key is rejected by name. */
export const validarReporteSchema = z.strictObject({
  tipoAccion: z.enum(Object.values(TipoAccionValidacion) as [TipoAccionValidacion, ...TipoAccionValidacion[]]),
});
export type ValidarReporteRequestDTO = z.infer<typeof validarReporteSchema>;

/** POST /api/reportes/:id/denuncias body: `detalle` (up to 280 characters) is mandatory when `motivo` is OTRO. */
export const denunciarReporteSchema = z
  .strictObject({
    motivo: z.enum(Object.values(MotivoDenuncia) as [MotivoDenuncia, ...MotivoDenuncia[]]),
    detalle: z.string().max(DETALLE_DENUNCIA_MAX).nullish(),
  })
  .superRefine((cuerpo, ctx) => {
    if (cuerpo.motivo === MotivoDenuncia.OTRO && !cuerpo.detalle?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['detalle'], message: 'Describe el motivo de tu denuncia.' });
    }
  });
export type DenunciarReporteRequestDTO = z.infer<typeof denunciarReporteSchema>;

/**
 * GET /api/validaciones/pendientes query: `lat` and `lng` are required; `radioKm` is 0.1-20 (`radioPorDefectoKm` when
 * absent), `horas` 1-24 (`horasPorDefecto`), `page` >= 1 (1) and `size` 1-50 (20).
 */
export const crearListarPendientesQuerySchema = (radioPorDefectoKm: number, horasPorDefecto: number) =>
  z.object({
    lat: decimal(-LAT_MAX, LAT_MAX),
    lng: decimal(-LNG_MAX, LNG_MAX),
    radioKm: decimal(RADIO_MIN_KM, RADIO_MAX_KM).default(radioPorDefectoKm),
    horas: entero(1, HORAS_MAX).default(horasPorDefecto),
    page: entero(1, ID_MAX).default(1),
    size: entero(1, TAMANO_PAGINA_PENDIENTES_MAX).default(TAMANO_PAGINA_PENDIENTES_DEFECTO),
  });
export type ListarPendientesQueryDTO = z.infer<ReturnType<typeof crearListarPendientesQuerySchema>>;
