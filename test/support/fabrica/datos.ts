import type { Usuario } from '../../../src/entity/Usuario.js';
import { EstadoCuenta } from '../../../src/enum/EstadoCuenta.js';
import { Rol } from '../../../src/enum/Rol.js';

let secuencia = 0;

/** Test data builder: a valid, active Usuario; override only what the test cares about. */
export function aUsuario(sobrescritos: Partial<Usuario> = {}): Usuario {
  secuencia += 1;
  return {
    id: secuencia,
    nombre: 'Ana',
    apellido: 'Pérez',
    email: `usuario${secuencia}@crowdradar.pe`,
    passwordHash: null,
    telefono: null,
    distrito: null,
    rol: Rol.USUARIO,
    status: EstadoCuenta.ACTIVO,
    puntosKarma: 0,
    createdAt: new Date('2026-10-05T10:00:00Z'),
    updatedAt: new Date('2026-10-05T10:00:00Z'),
    ...sobrescritos,
  };
}
