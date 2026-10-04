import { z } from 'zod';
import { emailSchema } from '../campos.js';
import { passwordSeguraSchema } from '../passwordSegura.js';

/** Longest recovery token accepted: far above the 43 characters issued, a cap against absurd inputs. */
const MAX_TOKEN = 200;
const tokenSchema = z.string().trim().min(1).max(MAX_TOKEN);

/** POST /api/auth/recuperar body. */
export const solicitarRecuperacionSchema = z.strictObject({ email: emailSchema });
export type SolicitarRecuperacionRequestDTO = z.infer<typeof solicitarRecuperacionSchema>;

/** GET /api/auth/restablecer/validar query. */
export const validarTokenQuerySchema = z.object({ token: tokenSchema });
export type ValidarTokenQueryDTO = z.infer<typeof validarTokenQuerySchema>;

/** POST /api/auth/restablecer body. The new password follows the single policy; the confirmation must match. */
export const restablecerPasswordSchema = z
  .strictObject({
    token: tokenSchema,
    nuevaPassword: passwordSeguraSchema,
    confirmarPassword: z.string(),
  })
  .refine((datos) => datos.nuevaPassword === datos.confirmarPassword, {
    path: ['confirmarPassword'],
    message: 'Las contraseñas no coinciden.',
  });
export type RestablecerPasswordRequestDTO = z.infer<typeof restablecerPasswordSchema>;
