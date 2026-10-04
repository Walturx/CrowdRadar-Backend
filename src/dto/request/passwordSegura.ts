import { z } from 'zod';
import { MAX_BYTES_PASSWORD } from './campos.js';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

/**
 * The one password policy (register, reset, change): 8..64 characters, at most 72 bytes (bcrypt reads no more, and
 * multibyte characters can reach it before 64 characters), an uppercase letter and a digit. Every check runs, so
 * each unmet requirement is its own issue (HU 2.2 c3, 2.3 c4).
 */
export const passwordSeguraSchema = z
  .string()
  .min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`)
  .max(PASSWORD_MAX, `La contraseña no puede superar ${PASSWORD_MAX} caracteres.`)
  .refine((valor) => Buffer.byteLength(valor, 'utf8') <= MAX_BYTES_PASSWORD, `La contraseña no puede superar ${MAX_BYTES_PASSWORD} bytes.`)
  .regex(/\p{Lu}/u, 'La contraseña debe incluir al menos una letra mayúscula.')
  .regex(/\d/, 'La contraseña debe incluir al menos un dígito.');
