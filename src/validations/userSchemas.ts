import { z } from 'zod';

export const updateUserSchema = z.strictObject({
  nombre: z.string().min(2).optional(),
  apellido: z.string().min(2).optional(),
  telefono: z.string().optional(),
  distrito: z.string().optional(),
});
