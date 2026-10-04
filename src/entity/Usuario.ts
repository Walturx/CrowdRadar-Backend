import type { EstadoCuenta } from '../enum/EstadoCuenta.js';
import type { Rol } from '../enum/Rol.js';

/** Domain entity for the `usuario` table; services never see the Sequelize model. */
export interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  passwordHash: string | null;
  telefono: string | null;
  distrito: string | null;
  rol: Rol;
  status: EstadoCuenta;
  puntosKarma: number;
  /** Last password change; tokens issued before it are rejected. Null when it never changed. */
  passwordCambiadaEn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
