/**
 * Request schemas of the account endpoints: trimming, email lowercase, DB length limits
 * (migration 01: email 120, nombre/apellido 80, telefono 20, distrito 60) and bcrypt's 72-byte limit.
 */
import { describe, expect, it } from 'vitest';
import { iniciarSesionSchema } from '../../src/dto/request/auth/IniciarSesionRequestDTO.js';
import { registrarUsuarioSchema } from '../../src/dto/request/auth/RegistrarUsuarioRequestDTO.js';
import { actualizarPerfilSchema } from '../../src/dto/request/usuario/ActualizarPerfilRequestDTO.js';
import { cambiarPasswordSchema } from '../../src/dto/request/usuario/CambiarPasswordRequestDTO.js';

const registroValido = {
  nombre: 'Ana',
  apellido: 'Perez',
  email: 'ana@crowdradar.pe',
  password: 'Secreta123',
  telefono: '987654321',
  distrito: 'Miraflores',
};
const campos = (resultado: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  resultado.error?.issues.map((i) => i.path.join('.')) ?? [];

describe('registrarUsuarioSchema', () => {
  it('acepta el cuerpo que envia la app', () => {
    expect(registrarUsuarioSchema.parse(registroValido)).toEqual(registroValido);
  });

  it('recorta espacios y pasa el email a minusculas', () => {
    const r = registrarUsuarioSchema.parse({
      ...registroValido,
      nombre: '  Ana ',
      email: '  ANA@CrowdRadar.PE ',
    });
    expect(r).toMatchObject({ nombre: 'Ana', email: 'ana@crowdradar.pe' });
  });

  it('telefono vacio u omitido queda en null', () => {
    expect(registrarUsuarioSchema.parse({ ...registroValido, telefono: '' })).toMatchObject({ telefono: null });
    const sin: Partial<typeof registroValido> = { ...registroValido };
    delete sin.telefono;
    expect(registrarUsuarioSchema.parse(sin)).toMatchObject({ telefono: null });
  });

  it('exige el distrito: omitido, vacio o null se rechaza sobre distrito', () => {
    const sin: Partial<typeof registroValido> = { ...registroValido };
    delete sin.distrito;
    expect(campos(registrarUsuarioSchema.safeParse(sin))).toEqual(['distrito']);
    expect(campos(registrarUsuarioSchema.safeParse({ ...registroValido, distrito: '  ' }))).toEqual(['distrito']);
    expect(campos(registrarUsuarioSchema.safeParse({ ...registroValido, distrito: null }))).toEqual(['distrito']);
  });

  it('solo acepta un distrito de Lima o Callao, con su nombre oficial', () => {
    expect(registrarUsuarioSchema.parse({ ...registroValido, distrito: ' Ventanilla ' })).toMatchObject({ distrito: 'Ventanilla' });
    expect(registrarUsuarioSchema.parse({ ...registroValido, distrito: 'San Martín de Porres' })).toMatchObject({
      distrito: 'San Martín de Porres',
    });
    const r = registrarUsuarioSchema.safeParse({ ...registroValido, distrito: 'Narnia' });
    expect(campos(r)).toEqual(['distrito']);
    expect(r.error?.issues[0]?.message).toBe('Selecciona un distrito de la lista.');
    expect(campos(registrarUsuarioSchema.safeParse({ ...registroValido, distrito: 'miraflores' }))).toEqual(['distrito']);
  });

  it.each([
    ['email', { email: 'x' }],
    ['email', { email: `${'a'.repeat(110)}@crowdradar.pe` }],
    ['nombre', { nombre: 'A' }],
    ['nombre', { nombre: 'A'.repeat(81) }],
    ['apellido', { apellido: 'P'.repeat(81) }],
    ['password', { password: 'corta' }],
    ['password', { password: 'a'.repeat(73) }],
    ['password', { password: 'ñ'.repeat(37) }],
    ['telefono', { telefono: '9'.repeat(21) }],
  ])('rechaza %s fuera de los limites', (campo, cambio) => {
    const r = registrarUsuarioSchema.safeParse({ ...registroValido, ...cambio });
    expect(r.success).toBe(false);
    expect(campos(r)).toContain(campo);
  });

  it('acepta el borde: email 120, nombre 80, password 8 y 64 caracteres', () => {
    const email = `${'a'.repeat(120 - '@crowdradar.pe'.length)}@crowdradar.pe`;
    const borde = { ...registroValido, email, nombre: 'N'.repeat(80), password: 'Ppppppp1' };
    expect(registrarUsuarioSchema.safeParse(borde).success).toBe(true);
    expect(registrarUsuarioSchema.safeParse({ ...registroValido, password: `P1${'p'.repeat(62)}` }).success).toBe(true);
  });

  it('rechaza campos desconocidos (rol)', () => {
    expect(registrarUsuarioSchema.safeParse({ ...registroValido, rol: 'ADMIN' }).success).toBe(false);
  });
});

describe('iniciarSesionSchema', () => {
  it('normaliza el email y exige password', () => {
    expect(iniciarSesionSchema.parse({ email: ' ANA@crowdradar.pe ', password: 'x' })).toEqual({
      email: 'ana@crowdradar.pe',
      password: 'x',
    });
    expect(iniciarSesionSchema.safeParse({ email: 'ana@crowdradar.pe' }).success).toBe(false);
    expect(iniciarSesionSchema.safeParse({ email: 'ana@crowdradar.pe', password: '' }).success).toBe(false);
  });

  it('limita la password a 72 bytes y rechaza campos extra', () => {
    expect(iniciarSesionSchema.safeParse({ email: 'a@b.pe', password: 'a'.repeat(73) }).success).toBe(false);
    expect(iniciarSesionSchema.safeParse({ email: 'a@b.pe', password: 'x', otro: 1 }).success).toBe(false);
  });
});

describe('actualizarPerfilSchema', () => {
  it('acepta un subconjunto y deja fuera lo omitido', () => {
    expect(actualizarPerfilSchema.parse({ nombre: ' Anita ' })).toEqual({ nombre: 'Anita' });
  });

  it('"" en telefono significa limpiar (null)', () => {
    expect(actualizarPerfilSchema.parse({ telefono: '' })).toEqual({ telefono: null });
  });

  it('el distrito no se puede limpiar: "" o null se rechaza sobre distrito', () => {
    expect(campos(actualizarPerfilSchema.safeParse({ distrito: '' }))).toEqual(['distrito']);
    expect(campos(actualizarPerfilSchema.safeParse({ distrito: null }))).toEqual(['distrito']);
  });

  it('exige al menos un campo y rechaza claves desconocidas o limites excedidos', () => {
    expect(actualizarPerfilSchema.safeParse({}).success).toBe(false);
    expect(actualizarPerfilSchema.safeParse({ email: 'x@y.pe' }).success).toBe(false);
    expect(actualizarPerfilSchema.safeParse({ nombre: 'N'.repeat(81) }).success).toBe(false);
    expect(actualizarPerfilSchema.safeParse({ distrito: 'D'.repeat(61) }).success).toBe(false);
    expect(actualizarPerfilSchema.safeParse({ distrito: 'Narnia' }).success).toBe(false);
  });
});

describe('cambiarPasswordSchema', () => {
  const valido = { passwordActual: 'Vieja1234', nuevaPassword: 'Nueva12345', confirmarPassword: 'Nueva12345' };

  it('acepta el cuerpo que envia la app', () => {
    expect(cambiarPasswordSchema.parse(valido)).toEqual(valido);
  });

  it('confirmarPassword distinta se reporta sobre confirmarPassword', () => {
    const r = cambiarPasswordSchema.safeParse({ ...valido, confirmarPassword: 'Otra123456' });
    expect(campos(r)).toEqual(['confirmarPassword']);
  });

  it('la nueva password respeta la politica (8..64 caracteres)', () => {
    const corta = cambiarPasswordSchema.safeParse({ ...valido, nuevaPassword: 'corta', confirmarPassword: 'corta' });
    expect(campos(corta)).toContain('nuevaPassword');
    const larga = 'a'.repeat(73);
    const r = cambiarPasswordSchema.safeParse({ ...valido, nuevaPassword: larga, confirmarPassword: larga });
    expect(campos(r)).toContain('nuevaPassword');
  });

  it('exige passwordActual y rechaza campos extra', () => {
    expect(cambiarPasswordSchema.safeParse({ ...valido, passwordActual: '' }).success).toBe(false);
    expect(cambiarPasswordSchema.safeParse({ ...valido, extra: 1 }).success).toBe(false);
  });
});

describe('actualizarPerfilSchema: telefono y distrito como en el registro (R3-1302)', () => {
  it.each(['12345', '812345678', '98765432', '9876543210', 'abcdefghi'])('rechaza el telefono %s', (telefono) => {
    expect(campos(actualizarPerfilSchema.safeParse({ telefono }))).toEqual(['telefono']);
  });

  it('acepta un telefono valido y lo vacio (null)', () => {
    expect(actualizarPerfilSchema.parse({ telefono: '987654321' })).toEqual({ telefono: '987654321' });
    expect(actualizarPerfilSchema.parse({ telefono: '' })).toEqual({ telefono: null });
  });

  it('acepta un distrito de la lista y rechaza uno que no esta', () => {
    expect(actualizarPerfilSchema.parse({ distrito: 'Ate' })).toEqual({ distrito: 'Ate' });
    expect(campos(actualizarPerfilSchema.safeParse({ distrito: 'A' }))).toEqual(['distrito']);
    expect(campos(actualizarPerfilSchema.safeParse({ distrito: ' ' }))).toEqual(['distrito']);
  });

  it('omitir el distrito al editar otro campo sigue siendo valido', () => {
    expect(actualizarPerfilSchema.parse({ nombre: 'Ana' })).toEqual({ nombre: 'Ana' });
  });
});
