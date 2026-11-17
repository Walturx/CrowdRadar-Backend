/**
 * Caja negra de la funcionalidad "Gestión de la contraseña" (HU 2.1 Recuperar, HU 2.2 Restablecer y HU 2.3 Cambiar).
 * Cinco campos de entrada: email (POST /api/auth/recuperar), token, nuevaPassword y confirmarPassword
 * (POST /api/auth/restablecer) y passwordActual (PUT /api/users/password, que también usa nuevaPassword y confirmarPassword).
 * Técnicas: particiones de equivalencia (PV válida, PI inválida) y valores límite (VL). Cada `it` es un caso CN-PWD.
 * La política de contraseña es 8 a 64 caracteres, con al menos una mayúscula y un dígito.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';

const REGISTRO = { nombre: 'Ana', apellido: 'Ruiz', email: 'ana.ruiz@crowdradar.pe', password: 'Vieja1234', telefono: '', distrito: 'Miraflores' };
const MENSAJE_NEUTRO = 'Si el correo está registrado, te enviamos instrucciones para restablecer tu contraseña.';
const VALIDA = 'Nueva12345';
/** A password of exactly n characters that meets the uppercase and digit rules. */
const deLargo = (n: number) => `A1${'b'.repeat(n - 2)}`;

describe('Gestión de la contraseña: 5 campos (caja negra, HU 2.1 a 2.3)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let jwt: string;

  const recuperar = (email: unknown) => request(app).post('/api/auth/recuperar').send({ email });
  const tokenDelCorreo = () => /token=([^\s"&]+)/.exec(ctx.correo.enviados.at(-1)!.texto)![1]!;
  /** Asks for a link and returns the token that arrived by mail. */
  const tokenVigente = async () => {
    await recuperar(REGISTRO.email);
    return tokenDelCorreo();
  };
  const restablecer = (token: unknown, nuevaPassword: unknown, confirmarPassword: unknown = nuevaPassword) =>
    request(app).post('/api/auth/restablecer').send({ token, nuevaPassword, confirmarPassword });
  const cambiar = (passwordActual: unknown, nuevaPassword: unknown, confirmarPassword: unknown = nuevaPassword) =>
    request(app).put('/api/users/password').set('Authorization', `Bearer ${jwt}`).send({ passwordActual, nuevaPassword, confirmarPassword });
  const login = (password: string) => request(app).post('/api/auth/login').send({ email: REGISTRO.email, password });
  const esperarError = (res: request.Response, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  };

  beforeEach(async () => {
    // The clock sits a few seconds ahead so password_cambiada_en is later than the iat of a JWT issued "now".
    const reloj = new RelojFijo(new Date(Date.now() + 5000));
    ctx = crearContenedorPrueba({ reloj, usuarioDAO: new UsuarioDAOMemoria({ reloj }) });
    app = createApp(ctx.contenedor);
    jwt = (await request(app).post('/api/auth/register').send(REGISTRO)).body.data.token;
  });

  describe('campo 1 · email (recuperar)', () => {
    it('CN-PWD-01 · PV · email registrado → 200 con el mensaje neutro y se envía 1 correo', async () => {
      const res = await recuperar(REGISTRO.email);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: MENSAJE_NEUTRO });
      expect(ctx.correo.enviados).toHaveLength(1);
    });
    it('CN-PWD-02 · PV · email registrado en MAYÚSCULAS → 200 y se envía el correo (no distingue mayúsculas)', async () => {
      const res = await recuperar(REGISTRO.email.toUpperCase());
      expect(res.status).toBe(200);
      expect(ctx.correo.enviados).toHaveLength(1);
    });
    it('CN-PWD-03 · PI · email no registrado → 200 con el MISMO mensaje y no se envía correo (no revela cuentas)', async () => {
      const res = await recuperar('nadie@crowdradar.pe');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: MENSAJE_NEUTRO });
      expect(ctx.correo.enviados).toHaveLength(0);
    });
    it('CN-PWD-04 · PI · email mal formado ("ana.ruiz") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await recuperar('ana.ruiz'), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-PWD-05 · VL · email vacío ("") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await recuperar(''), 400, 'VALIDACION_FALLIDA');
    });
  });

  describe('campo 2 · token (restablecer)', () => {
    it('CN-PWD-06 · PV · token vigente del correo → 200, la contraseña nueva entra y la anterior ya no', async () => {
      const res = await restablecer(await tokenVigente(), VALIDA);
      expect(res.status).toBe(200);
      expect((await login(VALIDA)).status).toBe(200);
      expect((await login(REGISTRO.password)).status).toBe(401);
    });
    it('CN-PWD-07 · PI · token que nunca se emitió → 400 TOKEN_RECUPERACION_INVALIDO', async () => {
      esperarError(await restablecer('token-inventado', VALIDA), 400, 'TOKEN_RECUPERACION_INVALIDO');
    });
    it('CN-PWD-08 · PI · token ya usado una vez → 400 TOKEN_RECUPERACION_INVALIDO (un solo uso)', async () => {
      const token = await tokenVigente();
      expect((await restablecer(token, VALIDA)).status).toBe(200);
      esperarError(await restablecer(token, 'Otra12345'), 400, 'TOKEN_RECUPERACION_INVALIDO');
    });
    it('CN-PWD-09 · VL · token vacío ("") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await restablecer('', VALIDA), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-PWD-10 · VL · token de 201 caracteres (máximo 200) → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await restablecer('t'.repeat(201), VALIDA), 400, 'VALIDACION_FALLIDA');
    });
  });

  describe('campo 3 · nuevaPassword (restablecer)', () => {
    it('CN-PWD-11 · VL · 7 caracteres (mínimo 8) → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await restablecer(await tokenVigente(), deLargo(7)), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-PWD-12 · VL · 8 caracteres (límite inferior) → 200', async () => {
      expect((await restablecer(await tokenVigente(), deLargo(8))).status).toBe(200);
    });
    it('CN-PWD-13 · VL · 64 caracteres (límite superior) → 200', async () => {
      expect((await restablecer(await tokenVigente(), deLargo(64))).status).toBe(200);
    });
    it('CN-PWD-14 · VL · 65 caracteres → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await restablecer(await tokenVigente(), deLargo(65)), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-PWD-15 · PI · sin mayúscula ("nueva12345") → 400 con el mensaje de la regla', async () => {
      const res = await restablecer(await tokenVigente(), 'nueva12345');
      esperarError(res, 400, 'VALIDACION_FALLIDA');
      expect(res.body.errors.map((e: { mensaje: string }) => e.mensaje)).toContain('La contraseña debe incluir al menos una letra mayúscula.');
    });
    it('CN-PWD-16 · PI · sin dígito ("NuevaClave") → 400 con el mensaje de la regla', async () => {
      const res = await restablecer(await tokenVigente(), 'NuevaClave');
      esperarError(res, 400, 'VALIDACION_FALLIDA');
      expect(res.body.errors.map((e: { mensaje: string }) => e.mensaje)).toContain('La contraseña debe incluir al menos un dígito.');
    });
  });

  describe('campo 4 · confirmarPassword (restablecer y cambiar)', () => {
    it('CN-PWD-17 · PV · igual a la nueva → 200', async () => {
      expect((await restablecer(await tokenVigente(), VALIDA, VALIDA)).status).toBe(200);
    });
    it('CN-PWD-18 · PI · distinta de la nueva → 400 con el error en el campo confirmarPassword', async () => {
      const res = await restablecer(await tokenVigente(), VALIDA, 'Nueva12346');
      esperarError(res, 400, 'VALIDACION_FALLIDA');
      expect(res.body.errors).toContainEqual({ campo: 'confirmarPassword', mensaje: 'Las contraseñas no coinciden.' });
    });
  });

  describe('campo 5 · passwordActual (cambiar, con sesión)', () => {
    it('CN-PWD-19 · PV · contraseña actual correcta y nueva válida → 200 y la nueva entra', async () => {
      expect((await cambiar(REGISTRO.password, VALIDA)).status).toBe(200);
      expect((await login(VALIDA)).status).toBe(200);
    });
    it('CN-PWD-20 · PI · contraseña actual incorrecta → 422 PASSWORD_ACTUAL_INCORRECTA', async () => {
      esperarError(await cambiar('Otra12345', VALIDA), 422, 'PASSWORD_ACTUAL_INCORRECTA');
    });
    it('CN-PWD-21 · PI · nueva igual a la actual → 422 PASSWORD_REPETIDA', async () => {
      esperarError(await cambiar(REGISTRO.password, REGISTRO.password), 422, 'PASSWORD_REPETIDA');
    });
    it('CN-PWD-22 · VL · contraseña actual vacía ("") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await cambiar('', VALIDA), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-PWD-23 · PI · sin sesión (sin token) → 401 NO_AUTENTICADO', async () => {
      const res = await request(app).put('/api/users/password').send({ passwordActual: REGISTRO.password, nuevaPassword: VALIDA, confirmarPassword: VALIDA });
      esperarError(res, 401, 'NO_AUTENTICADO');
    });
  });
});
