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

/** Peruvian mobile number: 9 digits starting with 9 (API contract, section 5). Blank means "no value" (null). */
export const telefonoSchema = textoOpcional(20)
  .refine((valor) => valor == null || /^9\d{8}$/.test(valor), 'El teléfono debe tener 9 dígitos y empezar con 9.')
  .transform((valor) => valor ?? null);

/** District name: at least 2 characters. Blank means "no value" (null). */
export const distritoSchema = textoOpcional(60)
  .refine((valor) => valor == null || valor.length >= 2, 'El distrito debe tener al menos 2 caracteres.')
  .transform((valor) => valor ?? null);

/** Email normalised before it is validated: trimmed, lowercase, at most 120 characters. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(120));

/** Password being checked (login, current password): required, 72 bytes maximum. A NEW password uses passwordSeguraSchema. */
export const passwordExistenteSchema = z
  .string()
  .min(1)
  .refine((valor) => Buffer.byteLength(valor, 'utf8') <= MAX_BYTES_PASSWORD, `La contraseña no puede superar ${MAX_BYTES_PASSWORD} bytes.`);
