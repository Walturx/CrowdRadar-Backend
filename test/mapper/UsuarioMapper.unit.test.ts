/** Mapper: entity -> response DTOs. The password hash never leaves the service layer. */
import { describe, expect, it } from 'vitest';
import { UsuarioMapper } from '../../src/mapper/UsuarioMapper.js';
import { aUsuario } from '../support/fabrica/datos.js';

describe('UsuarioMapper', () => {
  const usuario = aUsuario({
    id: 5,
    nombre: 'Ana',
    apellido: 'Perez',
    email: 'ana@crowdradar.pe',
    passwordHash: '$2b$10$secreto',
    telefono: '987654321',
    distrito: 'Lince',
    puntosKarma: 12,
  });

  it('aResponse expone solo los campos publicos', () => {
    const dto = UsuarioMapper.aResponse(usuario);
    expect(dto).toEqual({
      id: 5,
      nombre: 'Ana',
      apellido: 'Perez',
      email: 'ana@crowdradar.pe',
      telefono: '987654321',
      distrito: 'Lince',
      rol: 'USUARIO',
      status: 'ACTIVO',
      puntosKarma: 12,
    });
    expect(JSON.stringify(dto)).not.toContain('secreto');
  });

  it('aPerfil envuelve el usuario en { user }', () => {
    expect(UsuarioMapper.aPerfil(usuario)).toEqual({ user: UsuarioMapper.aResponse(usuario) });
  });

  it('aSesion une token, expiracion ISO y usuario', () => {
    const expiraEn = new Date('2026-10-05T12:00:00Z');
    expect(UsuarioMapper.aSesion(usuario, { token: 't', expiraEn })).toEqual({
      token: 't',
      expiraEn: '2026-10-05T12:00:00.000Z',
      user: UsuarioMapper.aResponse(usuario),
    });
  });
});
