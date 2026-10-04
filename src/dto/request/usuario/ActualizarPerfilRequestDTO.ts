import { z } from 'zod';
import { textoOpcional, textoRequerido } from '../campos.js';

/** PUT /api/users/profile body: any subset of the profile fields, at least one; `""` clears telefono/distrito. */
export const actualizarPerfilSchema = z
  .strictObject({
    nombre: textoRequerido(2, 80).optional(),
    apellido: textoRequerido(2, 80).optional(),
    telefono: textoOpcional(20),
    distrito: textoOpcional(60),
  })
  .refine((datos) => Object.values(datos).some((valor) => valor !== undefined), {
    message: 'Debes enviar al menos un campo.',
  });

export type ActualizarPerfilRequestDTO = z.infer<typeof actualizarPerfilSchema>;
