/** autenticar: Bearer parsing, token verification, DB re-read, account status. Spec R-A7.1, R-A7.2. */
import type { Express } from 'express';
import { ConnectionRefusedError } from 'sequelize';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { Rol } from '../../src/enum/Rol.js';
import { crearAutenticar } from '../../src/middleware/autenticar.js';
import { VerificadorEstadoCuentaImpl } from '../../src/service/impl/VerificadorEstadoCuentaImpl.js';
import { EmisorTokenFalso } from '../support/adapter/EmisorTokenFalso.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { aUsuario } from '../support/fabrica/datos.js';
import { crearAppPrueba } from '../support/appPrueba.js';

/** Token `iat` used by the claims helper (seconds). */
const SEGUNDOS_BASE = Date.parse('2026-10-05T10:00:00Z') / 1000;

describe('autenticar', () => {
  let dao: UsuarioDAOMemoria;
  let emisor: EmisorTokenFalso;
  let app: Express;

  const claimsDe = (usuario: ReturnType<typeof aUsuario>, extra = {}) => ({
    sub: String(usuario.id),
    id: usuario.id,
    email: usuario.email,
    rol: usuario.rol,
    status: usuario.status,
    iat: SEGUNDOS_BASE,
    ...extra,
  });

  beforeEach(() => {
    dao = new UsuarioDAOMemoria();
    emisor = new EmisorTokenFalso();
    const autenticar = crearAutenticar({ emisorToken: emisor, usuarioDAO: dao, verificador: new VerificadorEstadoCuentaImpl() });
    app = crearAppPrueba({
      montar: (a) => {
        a.get('/protegida', autenticar, (req, res) => {
          res.json({ id: req.usuario?.id, rol: req.usuario?.rol, email: req.usuario?.email });
        });
      },
    });
  });

  describe('cabecera Authorization', () => {
    it.each([
      ['ausente', undefined],
      ['esquema Basic', 'Basic abc123'],
      ['bearer en minusculas', 'bearer token-x'],
      ['solo la palabra Bearer', 'Bearer'],
      ['Bearer con espacio y sin token', 'Bearer '],
      ['token con espacios', 'Bearer token x'],
      ['sin esquema', 'token-x'],
    ])('%s -> 401 NO_AUTENTICADO', async (_caso, cabecera) => {
      const peticion = request(app).get('/protegida');
      const res = await (cabecera === undefined ? peticion : peticion.set('Authorization', cabecera));
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Debes iniciar sesión para continuar.', code: 'NO_AUTENTICADO', errors: [] });
    });
  });

  describe('token', () => {
    it('token que no verifica (expirado, mal firmado o malformado) -> 401 TOKEN_INVALIDO', async () => {
      const res = await request(app).get('/protegida').set('Authorization', 'Bearer no-registrado');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Token inválido o expirado.', code: 'TOKEN_INVALIDO', errors: [] });
    });

    it('token valido de un usuario que ya no existe -> 401 TOKEN_INVALIDO', async () => {
      const fantasma = aUsuario();
      emisor.registrar('token-fantasma', claimsDe(fantasma));
      const res = await request(app).get('/protegida').set('Authorization', 'Bearer token-fantasma');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_INVALIDO');
    });

    it('claims sin id numerico entero -> 401 TOKEN_INVALIDO', async () => {
      const usuario = dao.agregar(aUsuario());
      emisor.registrar('token-id-raro', claimsDe(usuario, { id: 'uno' }));
      const res = await request(app).get('/protegida').set('Authorization', 'Bearer token-id-raro');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_INVALIDO');
    });
  });

  describe('cambio de password invalida tokens anteriores (R1-402)', () => {
    const cambiadaEn = (segundos: number) => new Date((SEGUNDOS_BASE + segundos) * 1000);
    const llamar = (token: string) => request(app).get('/protegida').set('Authorization', `Bearer ${token}`);

    it('token emitido antes del cambio de password -> 401 TOKEN_INVALIDO', async () => {
      const usuario = dao.agregar(aUsuario({ passwordCambiadaEn: cambiadaEn(60) }));
      emisor.registrar('token-viejo', claimsDe(usuario));
      const res = await llamar('token-viejo');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Token inválido o expirado.', code: 'TOKEN_INVALIDO', errors: [] });
    });

    it('token emitido despues del cambio -> continua', async () => {
      const usuario = dao.agregar(aUsuario({ passwordCambiadaEn: cambiadaEn(-60) }));
      emisor.registrar('token-nuevo', claimsDe(usuario));
      expect((await llamar('token-nuevo')).status).toBe(200);
    });

    it('en el mismo segundo del cambio el token sigue valido (iat tiene resolucion de segundos)', async () => {
      const usuario = dao.agregar(aUsuario({ passwordCambiadaEn: new Date((SEGUNDOS_BASE + 0.9) * 1000) }));
      emisor.registrar('token-mismo-segundo', claimsDe(usuario));
      expect((await llamar('token-mismo-segundo')).status).toBe(200);
    });

    it('sin cambio de password registrado (null) ningun token se descarta', async () => {
      const usuario = dao.agregar(aUsuario({ passwordCambiadaEn: null }));
      emisor.registrar('token-sin-cambio', claimsDe(usuario, { iat: 1 }));
      expect((await llamar('token-sin-cambio')).status).toBe(200);
    });

    it('el rechazo ocurre antes de evaluar el estado de la cuenta', async () => {
      const usuario = dao.agregar(aUsuario({ passwordCambiadaEn: cambiadaEn(60), status: EstadoCuenta.SUSPENDIDO }));
      emisor.registrar('token-viejo-suspendido', claimsDe(usuario));
      expect((await llamar('token-viejo-suspendido')).body.code).toBe('TOKEN_INVALIDO');
    });
  });

  describe('usuario', () => {
    it('usuario activo -> continua y deja req.usuario con la fila de la base de datos', async () => {
      const usuario = dao.agregar(aUsuario({ nombre: 'Luz', rol: Rol.USUARIO }));
      emisor.registrar('token-ok', claimsDe(usuario));
      const res = await request(app).get('/protegida').set('Authorization', 'Bearer token-ok');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: usuario.id, rol: 'USUARIO', email: usuario.email });
    });

    it('la autorizacion usa la base, no los claims: token con rol ADMIN de un USUARIO sigue siendo USUARIO', async () => {
      const usuario = dao.agregar(aUsuario({ rol: Rol.USUARIO }));
      emisor.registrar('token-inflado', claimsDe(usuario, { rol: Rol.ADMIN }));
      const res = await request(app).get('/protegida').set('Authorization', 'Bearer token-inflado');
      expect(res.status).toBe(200);
      expect(res.body.rol).toBe('USUARIO');
    });

    it('usuario SUSPENDIDO en la base (token aun valido) -> 403 CUENTA_SUSPENDIDA', async () => {
      const usuario = dao.agregar(aUsuario({ status: EstadoCuenta.SUSPENDIDO }));
      emisor.registrar('token-suspendido', claimsDe(usuario, { status: EstadoCuenta.ACTIVO }));
      const res = await request(app).get('/protegida').set('Authorization', 'Bearer token-suspendido');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'Tu cuenta está suspendida.', code: 'CUENTA_SUSPENDIDA', errors: [] });
    });
  });

  it('si la base de datos no responde, el error llega al manejador (503) y no se confunde con token invalido', async () => {
    const usuario = aUsuario();
    emisor.registrar('token-caida', claimsDe(usuario));
    dao.fallo = new ConnectionRefusedError(new Error('connect ECONNREFUSED'));
    const res = await request(app).get('/protegida').set('Authorization', 'Bearer token-caida');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICIO_NO_DISPONIBLE');
  });
});
