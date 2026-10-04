import { z } from 'zod';

export const registerSchema = z.strictObject({
  nombre: z.string().min(2),
  apellido: z.string().min(2),
  email: z.email(),
  password: z.string().min(8),
  telefono: z.string().optional(),
  distrito: z.string().optional(),
});

export const loginSchema = z.strictObject({
  email: z.email(),
  password: z.string(),
});

export type RegistroDatos = z.infer<typeof registerSchema>;
