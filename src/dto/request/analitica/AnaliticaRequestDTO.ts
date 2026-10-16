import { z } from 'zod';
import { AgrupacionHistorial } from '../../../enum/AgrupacionHistorial.js';
import { FiltroDias } from '../../../enum/FiltroDias.js';

/** True for a calendar day that exists; JS rolls 2026-02-30 over to March, so the round trip must give the same text. */
const esDiaReal = (dia: string) => {
  const instante = new Date(`${dia}T00:00:00Z`);
  return !Number.isNaN(instante.getTime()) && instante.toISOString().startsWith(dia);
};

/** Calendar day YYYY-MM-DD that exists (2026-02-30 does not). */
const diaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Debe tener el formato AAAA-MM-DD.')
  .refine(esDiaReal, 'Debe ser una fecha válida.');

const filtroDiasSchema = z.enum(Object.values(FiltroDias) as [FiltroDias, ...FiltroDias[]]);
const agrupacionSchema = z.enum(Object.values(AgrupacionHistorial) as [AgrupacionHistorial, ...AgrupacionHistorial[]]);

export const MIN_SEMANAS = 1;
export const MAX_SEMANAS = 12;
export const SEMANAS_POR_DEFECTO = 4;

/** `:id` of every analytics route. */
export const lugarIdSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/lugares/:id/historial query. */
export const historialSchema = z.strictObject({
  desde: diaSchema.optional(),
  hasta: diaSchema.optional(),
  agrupacion: agrupacionSchema.default(AgrupacionHistorial.HORA),
});

/** GET /api/lugares/:id/comparar query: the four dates are required, the day filters default to TODOS. */
export const compararSchema = z.strictObject({
  desdeA: diaSchema,
  hastaA: diaSchema,
  diasA: filtroDiasSchema.default(FiltroDias.TODOS),
  desdeB: diaSchema,
  hastaB: diaSchema,
  diasB: filtroDiasSchema.default(FiltroDias.TODOS),
});

/** GET /api/lugares/:id/mejor-horario query. */
export const mejorHorarioSchema = z.strictObject({
  dias: filtroDiasSchema.default(FiltroDias.TODOS),
  semanas: z.coerce.number().int().min(MIN_SEMANAS).max(MAX_SEMANAS).default(SEMANAS_POR_DEFECTO),
});

export type HistorialQueryDTO = z.infer<typeof historialSchema>;
export type CompararQueryDTO = z.infer<typeof compararSchema>;
export type MejorHorarioQueryDTO = z.infer<typeof mejorHorarioSchema>;
