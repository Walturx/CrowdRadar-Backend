import type { EstadoCuenta } from '../../../enum/EstadoCuenta.js';
import type { Rol } from '../../../enum/Rol.js';
import type { Tier } from '../../../enum/Tier.js';

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
  /** Computed on every read from the user's reports and votes (CRO-72); integer >= 0. */
  puntos: number;
  tier: Tier;
}
