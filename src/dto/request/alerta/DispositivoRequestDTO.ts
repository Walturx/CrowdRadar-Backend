import { z } from 'zod';
import { PlataformaPush } from '../../../enum/PlataformaPush.js';

/** `dispositivo_push.token_fcm` is VARCHAR(255) (migration 10). */
const MAX_TOKEN = 255;
const tokenSchema = z.string().min(1).max(MAX_TOKEN);

/** POST /api/dispositivos body. */
export const registrarDispositivoSchema = z.strictObject({
  token: tokenSchema,
  plataforma: z.enum([PlataformaPush.ANDROID, PlataformaPush.IOS]),
});

export type RegistrarDispositivoRequestDTO = z.infer<typeof registrarDispositivoSchema>;

/** DELETE /api/dispositivos/:token params (Express already decoded the percent-encoding). */
export const dispositivoTokenParamsSchema = z.object({ token: tokenSchema });

export type DispositivoTokenParamsDTO = z.infer<typeof dispositivoTokenParamsSchema>;
