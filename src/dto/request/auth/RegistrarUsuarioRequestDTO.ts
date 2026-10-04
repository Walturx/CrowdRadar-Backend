import { z } from 'zod';
import { emailSchema, passwordNuevaSchema, textoOpcional, textoRequerido } from '../campos.js';

/** POST /api/auth/register body. Unknown keys (e.g. `rol`) are rejected. */
export const registrarUsuarioSchema = z.strictObject({
  nombre: textoRequerido(2, 80),
  apellido: textoRequerido(2, 80),
  email: emailSchema,
  password: passwordNuevaSchema,
  telefono: textoOpcional(20).transform((valor) => valor ?? null),
  distrito: textoOpcional(60).transform((valor) => valor ?? null),
});

export type RegistrarUsuarioRequestDTO = z.infer<typeof registrarUsuarioSchema>;
