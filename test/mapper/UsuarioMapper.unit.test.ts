/** Mapper: entity -> response DTOs. The password hash never leaves the service layer. */
import { describe, expect, it } from 'vitest';
import { Tier } from '../../src/enum/Tier.js';
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
  });
  const puntaje = { puntos: 120, tier: Tier.CROWD_EXPLORER };

  it('aResponse expone solo los campos publicos, con los puntos y el tier calculados', () => {
    const dto = UsuarioMapper.aResponse(usuario, puntaje);
    expect(dto).toEqual({
      id: 5,
      nombre: 'Ana',
      apellido: 'Perez',
      email: 'ana@crowdradar.pe',
      telefono: '987654321',
      distrito: 'Lince',
      rol: 'USUARIO',
      status: 'ACTIVO',
      puntos: 120,
      tier: 'CROWD_EXPLORER',
    });
    expect(JSON.stringify(dto)).not.toContain('secreto');
  });

  it('aPerfil envuelve el usuario en { user }', () => {
    expect(UsuarioMapper.aPerfil(usuario, puntaje)).toEqual({ user: UsuarioMapper.aResponse(usuario, puntaje) });
  });

  it('aSesion une token, expiracion ISO y usuario', () => {
    const expiraEn = new Date('2026-10-05T12:00:00Z');
    expect(UsuarioMapper.aSesion(usuario, { token: 't', expiraEn }, puntaje)).toEqual({
      token: 't',
      expiraEn: '2026-10-05T12:00:00.000Z',
      user: UsuarioMapper.aResponse(usuario, puntaje),
    });
  });
});
