import { z } from 'zod';

/**
 * Shared field schemas for request DTOs. Limits mirror migration 01 (usuario):
 * email 120, nombre/apellido 80, telefono 20, distrito 60; bcrypt reads at most 72 bytes.
 */
export const MAX_BYTES_PASSWORD = 72;

/** Trimmed required text with inclusive length bounds. */
export const textoRequerido = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Trimmed optional text column: blank means "no value" (null); absent stays undefined. */
export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((valor) => (valor === '' ? null : valor))
    .nullable()
    .optional();

/** Email normalised before it is validated: trimmed, lowercase, at most 120 characters. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(120));

const maxBytes = (valor: string) => Buffer.byteLength(valor, 'utf8') <= MAX_BYTES_PASSWORD;
const MENSAJE_BYTES = `La contraseña no puede superar ${MAX_BYTES_PASSWORD} bytes.`;

/** Password being created or changed: 8 characters minimum, 72 bytes maximum (bcrypt limit). */
export const passwordNuevaSchema = z.string().min(8).refine(maxBytes, MENSAJE_BYTES);

/** Password being checked (login, current password): required, same upper bound. */
export const passwordExistenteSchema = z.string().min(1).refine(maxBytes, MENSAJE_BYTES);
