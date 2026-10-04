import type { EstadoCuenta } from '../../../enum/EstadoCuenta.js';
import type { Rol } from '../../../enum/Rol.js';

/** Public view of an account. Never carries the password hash. */
export interface UsuarioResponseDTO {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  distrito: string | null;
  rol: Rol;
  status: EstadoCuenta;
  puntosKarma: number;
}
