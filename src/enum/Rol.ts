export const Rol = {
  USUARIO: 'USUARIO',
  ADMIN: 'ADMIN',
} as const;

export type Rol = (typeof Rol)[keyof typeof Rol];
