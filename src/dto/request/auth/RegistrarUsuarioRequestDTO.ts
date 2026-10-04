import { z } from 'zod';
import { DOMINIO_EMAIL_SINTETICO } from '../../../util/sintetico.js';
import { emailSchema, textoOpcional, textoRequerido } from '../campos.js';
import { passwordSeguraSchema } from '../passwordSegura.js';

/** Peruvian mobile number: 9 digits starting with 9 (API contract, section 5). */
const TELEFONO = /^9\d{8}$/;

/** POST /api/auth/register body. Unknown keys (e.g. `rol`) are rejected. */
export const registrarUsuarioSchema = z.strictObject({
  nombre: textoRequerido(2, 80),
  apellido: textoRequerido(2, 80),
  // The demo domain marks synthetic users (analytics flags their reports `sintetico`): a real signup may not use it.
  email: emailSchema.refine((email) => !email.endsWith(DOMINIO_EMAIL_SINTETICO), 'Ese dominio de correo está reservado.'),
  password: passwordSeguraSchema,
  // Blank means "no value" (null); anything else must be a valid number / a real district name (2..60).
  telefono: textoOpcional(20)
    .refine((valor) => valor == null || TELEFONO.test(valor), 'El teléfono debe tener 9 dígitos y empezar con 9.')
    .transform((valor) => valor ?? null),
  distrito: textoOpcional(60)
    .refine((valor) => valor == null || valor.length >= 2, 'El distrito debe tener al menos 2 caracteres.')
    .transform((valor) => valor ?? null),
});

export type RegistrarUsuarioRequestDTO = z.infer<typeof registrarUsuarioSchema>;
