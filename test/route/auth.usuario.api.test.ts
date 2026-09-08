/**
 * API tests of the account endpoints against the fake container (no database):
 * register, login, profile, password. Spec R-B1..R-B4, R-A7, R-A8.1; frontend contract.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';

const registro = {
  nombre: 'Ana',
  apellido: 'Perez',
  email: 'ana@crowdradar.pe',
  password: 'Secreta123',
  telefono: '987654321',
  distrito: 'Miraflores',
};

describe('API de cuentas (contenedor de prueba)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;

  const preparar = (cfg: Parameters<typeof crearContenedorPrueba>[0] = {}) => {
    ctx = crearContenedorPrueba(cfg);
    app = createApp(ctx.contenedor);
  };
  const registrar = async () => (await request(app).post('/api/auth/register').send(registro)).body.data as {
    token: string;
    user: { id: number };
  };
  const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeEach(() => preparar());

  describe('POST /api/auth/register', () => {
    it('201 con { message, data: { token, expiraEn, user } } y sin password ni hash', async () => {
      const res = await request(app).post('/api/auth/register').send(registro);
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Usuario registrado correctamente.');
      expect(res.body.data.token).toEqual(expect.any(String));
      expect(res.body.data.expiraEn).toEqual(expect.any(String));
      expect(res.body.data.user).toEqual({
        id: expect.any(Number),
        nombre: 'Ana',
        apellido: 'Perez',
        email: 'ana@crowdradar.pe',
        telefono: '987654321',
        distrito: 'Miraflores',
        rol: 'USUARIO',
        status: 'ACTIVO',
        puntosKarma: 0,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash|\$2[aby]\$/i);
      expect(ctx.emisorToken.verificar(res.body.data.token).id).toBe(res.body.data.user.id);
    });

    it('guarda el email en minusculas y telefono vacio como null', async () => {
      const res = await request(app).post('/api/auth/register').send({ ...registro, email: ' ANA@CrowdRadar.PE ', telefono: '' });
      expect(res.status).toBe(201);
      expect(res.body.data.user).toMatchObject({ email: 'ana@crowdradar.pe', telefono: null });
    });

    it('409 EMAIL_DUPLICADO (incluso con otras mayusculas) con el sobre de error', async () => {
      await request(app).post('/api/auth/register').send(registro);
      const res = await request(app).post('/api/auth/register').send({ ...registro, email: 'ANA@crowdradar.pe' });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ message: 'El correo ya está registrado.', code: 'EMAIL_DUPLICADO', errors: [] });
    });

    it('400 VALIDACION_FALLIDA con un error por campo invalido', async () => {
      const res = await request(app).post('/api/auth/register').send({ ...registro, email: 'x', password: 'corta' });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ message: 'Datos inválidos.', code: 'VALIDACION_FALLIDA' });
      expect(res.body.errors.map((e: { campo: string }) => e.campo).sort()).toEqual(['email', 'password']);
    });

    it('400 con un campo desconocido (rol) y no crea la cuenta', async () => {
      const res = await request(app).post('/api/auth/register').send({ ...registro, rol: 'ADMIN' });
      expect(res.status).toBe(400);
      expect(await ctx.usuarioDAO.buscarPorEmail(registro.email)).toBeNull();
    });

    it('429 DEMASIADAS_SOLICITUDES al superar el limite de registros por IP', async () => {
      preparar({ cfg: { LIMITE_REGISTRO: 2 } });
      for (let i = 0; i < 2; i++) {
        await request(app).post('/api/auth/register').send({ ...registro, email: `u${i}@crowdradar.pe` });
      }
      const res = await request(app).post('/api/auth/register').send({ ...registro, email: 'u9@crowdradar.pe' });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('DEMASIADAS_SOLICITUDES');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await registrar();
    });

    it('200 con { message, data: { token, expiraEn, user } }', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'ANA@crowdradar.pe', password: 'Secreta123' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Inicio de sesión exitoso.');
      expect(res.body.data.user).toMatchObject({ email: 'ana@crowdradar.pe', rol: 'USUARIO', status: 'ACTIVO' });
      expect(ctx.emisorToken.verificar(res.body.data.token).email).toBe('ana@crowdradar.pe');
    });

    it('password incorrecta y email desconocido (GENERICA) responden 401 con el MISMO cuerpo', async () => {
      const mala = await request(app).post('/api/auth/login').send({ email: 'ana@crowdradar.pe', password: 'Otra12345' });
      const desconocido = await request(app).post('/api/auth/login').send({ email: 'nadie@crowdradar.pe', password: 'Secreta123' });
      expect(mala.status).toBe(401);
      expect(mala.body).toEqual({ message: 'Correo o contraseña incorrectos.', code: 'CREDENCIALES_INVALIDAS', errors: [] });
      expect(desconocido.status).toBe(401);
      expect(desconocido.body).toEqual(mala.body);
    });

    it('con POLITICA_MENSAJES_AUTH=DETALLADA el email desconocido responde 404 CUENTA_NO_EXISTE', async () => {
      preparar({ cfg: { POLITICA_MENSAJES_AUTH: 'DETALLADA' } });
      const res = await request(app).post('/api/auth/login').send({ email: 'nadie@crowdradar.pe', password: 'Secreta123' });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CUENTA_NO_EXISTE');
    });

    it('cuenta suspendida: 403 CUENTA_SUSPENDIDA', async () => {
      const ana = await ctx.usuarioDAO.buscarPorEmail('ana@crowdradar.pe');
      await ctx.usuarioDAO.actualizarStatus(ana!.id, EstadoCuenta.SUSPENDIDO);
      const res = await request(app).post('/api/auth/login').send({ email: 'ana@crowdradar.pe', password: 'Secreta123' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CUENTA_SUSPENDIDA');
    });

    it('400 sin password', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'ana@crowdradar.pe' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Datos inválidos.');
    });

    it('429 tras superar los intentos fallidos desde la misma IP (aunque cambie el email)', async () => {
      preparar({ cfg: { LIMITE_LOGIN: 3 } });
      await registrar();
      for (let i = 0; i < 3; i++) {
        const res = await request(app).post('/api/auth/login').send({ email: `x${i}@crowdradar.pe`, password: 'Otra12345' });
        expect(res.status).toBe(401);
      }
      const res = await request(app).post('/api/auth/login').send({ email: 'ana@crowdradar.pe', password: 'Secreta123' });
      expect(res.status).toBe(429);
      expect(res.body).toMatchObject({ code: 'DEMASIADAS_SOLICITUDES' });
    });
  });

  describe('GET/PUT /api/users/profile', () => {
    let token: string;
    beforeEach(async () => {
      token = (await registrar()).token;
    });

    it('401 NO_AUTENTICADO sin cabecera', async () => {
      const res = await request(app).get('/api/users/profile');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'NO_AUTENTICADO' });
      expect(res.body.message).toEqual(expect.any(String));
    });

    it('401 TOKEN_INVALIDO con un token mal firmado', async () => {
      const res = await request(app).get('/api/users/profile').set(conToken('abc.def.ghi'));
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_INVALIDO');
    });

    it('GET 200 { message, data: { user } } sin hash', async () => {
      const res = await request(app).get('/api/users/profile').set(conToken(token));
      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({ email: 'ana@crowdradar.pe', nombre: 'Ana', distrito: 'Miraflores' });
      expect(res.body.message).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    });

    it('403 CUENTA_SUSPENDIDA cuando la cuenta se suspendio despues de emitir el token', async () => {
      const ana = await ctx.usuarioDAO.buscarPorEmail('ana@crowdradar.pe');
      await ctx.usuarioDAO.actualizarStatus(ana!.id, EstadoCuenta.SUSPENDIDO);
      const res = await request(app).get('/api/users/profile').set(conToken(token));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CUENTA_SUSPENDIDA');
    });

    it('PUT 200 actualiza solo los campos enviados y devuelve { user }', async () => {
      const res = await request(app).put('/api/users/profile').set(conToken(token)).send({ nombre: 'Anita', distrito: 'Barranco' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Perfil actualizado correctamente.');
      expect(res.body.data.user).toMatchObject({ nombre: 'Anita', distrito: 'Barranco', apellido: 'Perez', email: 'ana@crowdradar.pe' });
    });

    it('PUT con telefono "" limpia el telefono', async () => {
      const res = await request(app).put('/api/users/profile').set(conToken(token)).send({ telefono: '' });
      expect(res.status).toBe(200);
      expect(res.body.data.user.telefono).toBeNull();
    });

    it('PUT {} y PUT con campo desconocido responden 400 con errors[]', async () => {
      const vacio = await request(app).put('/api/users/profile').set(conToken(token)).send({});
      expect(vacio.status).toBe(400);
      expect(vacio.body).toMatchObject({ code: 'VALIDACION_FALLIDA' });
      expect(vacio.body.errors.length).toBeGreaterThan(0);
      const extra = await request(app).put('/api/users/profile').set(conToken(token)).send({ email: 'otro@crowdradar.pe' });
      expect(extra.status).toBe(400);
      expect(extra.body.errors[0].campo).toBe('email');
    });

    it('PUT sin token responde 401 antes de validar', async () => {
      const res = await request(app).put('/api/users/profile').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/users/password', () => {
    let token: string;
    const cuerpo = { passwordActual: 'Secreta123', nuevaPassword: 'Nueva12345', confirmarPassword: 'Nueva12345' };
    beforeEach(async () => {
      token = (await registrar()).token;
    });

    it('200 { message } y la nueva password sirve para iniciar sesion', async () => {
      const res = await request(app).put('/api/users/password').set(conToken(token)).send(cuerpo);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Contraseña actualizada correctamente.' });
      const viejo = await request(app).post('/api/auth/login').send({ email: 'ana@crowdradar.pe', password: 'Secreta123' });
      const nuevo = await request(app).post('/api/auth/login').send({ email: 'ana@crowdradar.pe', password: 'Nueva12345' });
      expect(viejo.status).toBe(401);
      expect(nuevo.status).toBe(200);
    });

    it('422 PASSWORD_ACTUAL_INCORRECTA', async () => {
      const res = await request(app).put('/api/users/password').set(conToken(token)).send({ ...cuerpo, passwordActual: 'Equivocada1' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PASSWORD_ACTUAL_INCORRECTA');
    });

    it('422 PASSWORD_REPETIDA cuando la nueva es igual a la actual', async () => {
      const igual = { passwordActual: 'Secreta123', nuevaPassword: 'Secreta123', confirmarPassword: 'Secreta123' };
      const res = await request(app).put('/api/users/password').set(conToken(token)).send(igual);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PASSWORD_REPETIDA');
    });

    it('400 con confirmarPassword distinta (campo confirmarPassword)', async () => {
      const res = await request(app).put('/api/users/password').set(conToken(token)).send({ ...cuerpo, confirmarPassword: 'Otra123456' });
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toEqual(['confirmarPassword']);
    });

    it('401 sin token', async () => {
      const res = await request(app).put('/api/users/password').send(cuerpo);
      expect(res.status).toBe(401);
    });
  });

  it('GET / responde el nombre de la API sin base de datos', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'CrowdRadar API' });
  });
});
