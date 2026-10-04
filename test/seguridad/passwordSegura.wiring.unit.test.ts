/** The single password policy is wired into every schema that creates a password (spec M1 R5, R6, R11). */
import { describe, expect, it } from 'vitest';
import { registrarUsuarioSchema } from '../../src/dto/request/auth/RegistrarUsuarioRequestDTO.js';
import { cambiarPasswordSchema } from '../../src/dto/request/usuario/CambiarPasswordRequestDTO.js';

const registro = { nombre: 'Ana', apellido: 'Perez', email: 'ana@crowdradar.pe', password: 'Secreta123' };
const cambio = (nueva: string) => ({ passwordActual: 'Vieja1234', nuevaPassword: nueva, confirmarPassword: nueva });
const mensajesDe = (resultado: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, campo: string) =>
  resultado.error?.issues.filter((i) => i.path.join('.') === campo).map((i) => i.message) ?? [];

describe.each([
  ['register', (password: string) => registrarUsuarioSchema.safeParse({ ...registro, password }), 'password'],
  ['cambiar password', (password: string) => cambiarPasswordSchema.safeParse(cambio(password)), 'nuevaPassword'],
])('%s', (_nombre, validar, campo) => {
  it('accepts a password that meets the policy', () => {
    expect(validar('Secreta123').success).toBe(true);
  });

  it('rejects a lowercase-only password without digit with one error per unmet rule', () => {
    const mensajes = mensajesDe(validar('secretaaa'), campo);
    expect(mensajes).toHaveLength(2);
    expect(new Set(mensajes).size).toBe(2);
  });

  it('rejects 65 characters', () => {
    expect(validar(`A1${'a'.repeat(63)}`).success).toBe(false);
  });
});
