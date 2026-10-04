import { z } from 'zod';
import { DOMINIO_EMAIL_SINTETICO } from '../../../util/sintetico.js';
import { distritoSchema, emailSchema, telefonoSchema, textoRequerido } from '../campos.js';
import { passwordSeguraSchema } from '../passwordSegura.js';

/** POST /api/auth/register body. Unknown keys (e.g. `rol`) are rejected. */
export const registrarUsuarioSchema = z.strictObject({
  nombre: textoRequerido(2, 80),
  apellido: textoRequerido(2, 80),
  // The demo domain marks synthetic users (analytics flags their reports `sintetico`): a real signup may not use it.
  email: emailSchema.refine((email) => !email.endsWith(DOMINIO_EMAIL_SINTETICO), 'Ese dominio de correo está reservado.'),
  password: passwordSeguraSchema,
  telefono: telefonoSchema,
  distrito: distritoSchema,
});

export type RegistrarUsuarioRequestDTO = z.infer<typeof registrarUsuarioSchema>;
