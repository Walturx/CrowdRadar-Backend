import { z } from 'zod';
import { passwordExistenteSchema } from '../campos.js';
import { passwordSeguraSchema } from '../passwordSegura.js';

/** PUT /api/users/password body. */
export const cambiarPasswordSchema = z
  .strictObject({
    passwordActual: passwordExistenteSchema,
    nuevaPassword: passwordSeguraSchema,
    confirmarPassword: z.string(),
  })
  .refine((datos) => datos.nuevaPassword === datos.confirmarPassword, {
    path: ['confirmarPassword'],
    message: 'Las contraseñas no coinciden.',
  });

export type CambiarPasswordRequestDTO = z.infer<typeof cambiarPasswordSchema>;
