/** Unit tests of the JWT Adapter: HS256 pinned on sign and verify, expiry from config, payload validated. */
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { JwtEmisorToken } from '../../../src/adapter/seguridad/impl/JwtEmisorToken.js';
import { EstadoCuenta } from '../../../src/enum/EstadoCuenta.js';
import { Rol } from '../../../src/enum/Rol.js';
import { aUsuario } from '../../support/fabrica/datos.js';

const SECRETO = 'j'.repeat(48);
const emisor = new JwtEmisorToken({ jwtSecreto: SECRETO, jwtExpiraEn: '1h' });
const claimsValidos = { sub: '7', id: 7, email: 'a@b.pe', rol: Rol.USUARIO, status: EstadoCuenta.ACTIVO };

describe('JwtEmisorToken.emitir', () => {
  it('firma HS256 con claims {sub, id, email, rol, status} y expira segun la configuracion', () => {
    const usuario = aUsuario({ id: 7, email: 'a@b.pe', rol: Rol.ADMIN });
    const antes = Date.now();
    const { token, expiraEn } = emisor.emitir(usuario);

    const { header, payload } = jwt.decode(token, { complete: true }) as {
      header: { alg: string };
      payload: Record<string, unknown>;
    };
    expect(header.alg).toBe('HS256');
    expect(payload).toMatchObject({ sub: '7', id: 7, email: 'a@b.pe', rol: 'ADMIN', status: 'ACTIVO' });
    expect(payload).not.toHaveProperty('passwordHash');
    expect(expiraEn.getTime()).toBeGreaterThanOrEqual(antes + 3600_000 - 2000);
    expect(expiraEn.getTime()).toBeLessThanOrEqual(Date.now() + 3600_000 + 2000);
  });
});

describe('JwtEmisorToken.verificar', () => {
  it('devuelve los claims de un token propio', () => {
    const { token } = emisor.emitir(aUsuario({ id: 7, email: 'a@b.pe' }));
    expect(emisor.verificar(token)).toMatchObject({ id: 7, email: 'a@b.pe', rol: 'USUARIO', status: 'ACTIVO' });
  });

  it('rechaza un token firmado con otro secreto', () => {
    const ajeno = jwt.sign(claimsValidos, 'o'.repeat(48), { algorithm: 'HS256' });
    expect(() => emisor.verificar(ajeno)).toThrow();
  });

  it('rechaza un token vencido', () => {
    const vencido = jwt.sign(claimsValidos, SECRETO, { algorithm: 'HS256', expiresIn: -10 });
    expect(() => emisor.verificar(vencido)).toThrow();
  });

  it('rechaza algoritmos distintos de HS256 (HS512 con el mismo secreto y alg none)', () => {
    const hs512 = jwt.sign(claimsValidos, SECRETO, { algorithm: 'HS512' });
    expect(() => emisor.verificar(hs512)).toThrow();
    const sinFirma = jwt.sign(claimsValidos, '', { algorithm: 'none' });
    expect(() => emisor.verificar(sinFirma)).toThrow();
  });

  it('rechaza texto que no es un JWT', () => {
    expect(() => emisor.verificar('abc.def.ghi')).toThrow();
  });

  it.each([
    ['sin id', { ...claimsValidos, id: undefined }],
    ['id como texto', { ...claimsValidos, id: '7' }],
    ['id decimal', { ...claimsValidos, id: 7.5 }],
    ['id negativo', { ...claimsValidos, id: -1 }],
    ['rol desconocido', { ...claimsValidos, rol: 'SUPERADMIN' }],
    ['status desconocido', { ...claimsValidos, status: 'OTRO' }],
    ['sin email', { ...claimsValidos, email: undefined }],
  ])('rechaza un payload firmado pero invalido (%s)', (_nombre, payload) => {
    const token = jwt.sign(payload, SECRETO, { algorithm: 'HS256', expiresIn: '1h' });
    expect(() => emisor.verificar(token)).toThrow();
  });
});
