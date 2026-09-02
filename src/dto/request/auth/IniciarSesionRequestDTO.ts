import { z } from 'zod';
import { emailSchema, passwordExistenteSchema } from '../campos.js';

/** POST /api/auth/login body. */
export const iniciarSesionSchema = z.strictObject({
  email: emailSchema,
  password: passwordExistenteSchema,
});

export type IniciarSesionRequestDTO = z.infer<typeof iniciarSesionSchema>;
