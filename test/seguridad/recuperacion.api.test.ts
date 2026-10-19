/**
 * API tests of the password recovery endpoints against the fake container (no database, mail spy, pinned clock).
 * Spec M1 R1, R2, R4, R5; HU 2.1, 2.2. The HTML page is covered by paginaRestablecer.api.test.ts.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';

const registro = { nombre: 'Ana', apellido: 'Ruiz', email: 'ana.ruiz@crowdradar.pe', password: 'Vieja1234', telefono: '', distrito: 'Miraflores' };
const NUEVA = 'Nueva12345';
const MENSAJE_NEUTRO = 'Si el correo está registrado, te enviamos instrucciones para restablecer tu contraseña.';

describe('API de recuperacion de contrasena (contenedor de prueba)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let reloj: RelojFijo;

  const preparar = async (cfg: Parameters<typeof crearContenedorPrueba>[0] = {}) => {
    // The clock sits a few seconds ahead so password_cambiada_en is later than the iat of a JWT issued "now".
    reloj = new RelojFijo(new Date(Date.now() + 5000));
    ctx = crearContenedorPrueba({ reloj, usuarioDAO: new UsuarioDAOMemoria({ reloj }), ...cfg });
    app = createApp(ctx.contenedor);
    return (await request(app).post('/api/auth/register').send(registro)).body.data as { token: string };
  };
  const solicitar = (email = registro.email) => request(app).post('/api/auth/recuperar').send({ email });
  const restablecer = (cuerpo: Record<string, unknown>) => request(app).post('/api/auth/restablecer').send(cuerpo);
  const login = (password: string) => request(app).post('/api/auth/login').send({ email: registro.email, password });
  const tokenDelCorreo = () => /token=([^\s"&]+)/.exec(ctx.correo.enviados.at(-1)!.texto)![1]!;

  beforeEach(async () => {
    await preparar();
  });

  describe('POST /api/auth/recuperar', () => {
    it('200 with the neutral message and no data for a registered email, and mails the link', async () => {
      const res = await solicitar();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: MENSAJE_NEUTRO });
      expect(ctx.correo.enviados).toHaveLength(1);
      expect(ctx.correo.enviados[0]!.para).toBe(registro.email);
    });

    it('unknown email: the same status and body, and no mail (anti-enumeration)', async () => {
      const conocido = await solicitar();
      const desconocido = await solicitar('nadie@crowdradar.pe');
      expect(desconocido.status).toBe(conocido.status);
      expect(desconocido.body).toEqual(conocido.body);
      expect(ctx.correo.enviados).toHaveLength(1);
    });

    it('a mail outage does not change the answer', async () => {
      ctx.correo.fallo = new Error('SMTP caido');
      const res = await solicitar();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: MENSAJE_NEUTRO });
    });

    it.each([
      ['malformed email', { email: 'no-es-un-correo' }],
      ['missing email', {}],
      ['extra field', { email: registro.email, extra: 1 }],
    ])('400 VALIDACION_FALLIDA for %s', async (_caso, cuerpo) => {
      const res = await request(app).post('/api/auth/recuperar').send(cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
    });

    it('DETALLADA: unknown email is 404 CUENTA_NO_EXISTE and a known one still 200', async () => {
      await preparar({ cfg: { POLITICA_MENSAJES_AUTH: 'DETALLADA' } });
      const desconocido = await solicitar('nadie@crowdradar.pe');
      expect(desconocido.status).toBe(404);
      expect(desconocido.body.code).toBe('CUENTA_NO_EXISTE');
      expect((await solicitar()).status).toBe(200);
    });

    it('429 on the 4th request for the same email even when the IP limit is not reached (R1-1302, 3 per hour)', async () => {
      for (let i = 0; i < 3; i++) expect((await solicitar()).status).toBe(200);
      const res = await solicitar();
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('DEMASIADAS_SOLICITUDES');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      // the mails sent are exactly the 3 allowed, and another email is not affected
      expect(ctx.correo.enviados).toHaveLength(3);
      expect((await solicitar('otra@crowdradar.pe')).status).toBe(200);
    });

    it('409 CONFLICTO when the generated token collides with a stored one; no second mail and the first link still works', async () => {
      await preparar({ tokensRecuperacion: ['token-repetido', 'token-repetido'] });
      expect((await solicitar()).status).toBe(200);
      const res = await solicitar();
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ message: 'El recurso ya existe o está en conflicto.', code: 'CONFLICTO', errors: [] });
      expect(ctx.correo.enviados).toHaveLength(1);
      expect((await request(app).get('/api/auth/restablecer/validar').query({ token: 'token-repetido' })).status).toBe(200);
    });

    it('the per-email counter ignores case and spaces, so a variant of the address cannot dodge it', async () => {
      for (const variante of [registro.email, registro.email.toUpperCase(), `  ${registro.email}  `]) expect((await solicitar(variante)).status).toBe(200);
      expect((await solicitar()).status).toBe(429);
    });

    it('429 DEMASIADAS_SOLICITUDES on the 6th request from one IP', async () => {
      // distinct emails: the per-email counter (3 per hour) is not what trips here
      for (let i = 0; i < 5; i++) expect((await solicitar(`persona${i}@crowdradar.pe`)).status).toBe(200);
      const res = await solicitar('persona5@crowdradar.pe');
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('DEMASIADAS_SOLICITUDES');
      expect(res.headers['retry-after']).toBeDefined();
    });
  });

  describe('GET /api/auth/restablecer/validar', () => {
    it('200 for a live token', async () => {
      await solicitar();
      const res = await request(app).get('/api/auth/restablecer/validar').query({ token: tokenDelCorreo() });
      expect(res.status).toBe(200);
    });

    it('400 TOKEN_RECUPERACION_INVALIDO for an unknown token', async () => {
      const res = await request(app).get('/api/auth/restablecer/validar').query({ token: 'desconocido' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TOKEN_RECUPERACION_INVALIDO');
    });

    it('410 TOKEN_RECUPERACION_EXPIRADO once the 30 minutes ran out', async () => {
      await solicitar();
      reloj.avanzarMinutos(31);
      const res = await request(app).get('/api/auth/restablecer/validar').query({ token: tokenDelCorreo() });
      expect(res.status).toBe(410);
      expect(res.body.code).toBe('TOKEN_RECUPERACION_EXPIRADO');
    });

    it('400 VALIDACION_FALLIDA without the token query parameter', async () => {
      const res = await request(app).get('/api/auth/restablecer/validar');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
    });
  });

  describe('POST /api/auth/restablecer', () => {
    const cuerpo = (token: string, extra: Record<string, unknown> = {}) => ({ token, nuevaPassword: NUEVA, confirmarPassword: NUEVA, ...extra });

    it('200: the old password stops working and the new one logs in', async () => {
      await solicitar();
      const res = await restablecer(cuerpo(tokenDelCorreo()));
      expect(res.status).toBe(200);
      expect((await login(registro.password)).status).toBe(401);
      expect((await login(NUEVA)).status).toBe(200);
    });

    it('the same token cannot be used twice (400 TOKEN_RECUPERACION_INVALIDO)', async () => {
      await solicitar();
      const token = tokenDelCorreo();
      await restablecer(cuerpo(token));
      const res = await restablecer(cuerpo(token, { nuevaPassword: 'Otra123456', confirmarPassword: 'Otra123456' }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TOKEN_RECUPERACION_INVALIDO');
    });

    it('410 for an expired token and nothing changes', async () => {
      await solicitar();
      reloj.avanzarMinutos(31);
      const res = await restablecer(cuerpo(tokenDelCorreo()));
      expect(res.status).toBe(410);
      expect((await login(registro.password)).status).toBe(200);
    });

    it('400 VALIDACION_FALLIDA when the confirmation does not match', async () => {
      await solicitar();
      const res = await restablecer(cuerpo(tokenDelCorreo(), { confirmarPassword: 'Distinta123' }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors).toEqual([{ campo: 'confirmarPassword', mensaje: 'Las contraseñas no coinciden.' }]);
    });

    it('400 with one error per unmet requirement for a weak password', async () => {
      await solicitar();
      const res = await restablecer(cuerpo(tokenDelCorreo(), { nuevaPassword: 'abc', confirmarPassword: 'abc' }));
      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveLength(3);
      expect(res.body.errors.every((e: { campo: string }) => e.campo === 'nuevaPassword')).toBe(true);
    });

    it('a weak password does not spend the token', async () => {
      await solicitar();
      const token = tokenDelCorreo();
      await restablecer(cuerpo(token, { nuevaPassword: 'abc', confirmarPassword: 'abc' }));
      expect((await restablecer(cuerpo(token))).status).toBe(200);
    });

    it('422 PASSWORD_REPETIDA when the new password equals the current one', async () => {
      await solicitar();
      const res = await restablecer(cuerpo(tokenDelCorreo(), { nuevaPassword: registro.password, confirmarPassword: registro.password }));
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PASSWORD_REPETIDA');
    });

    it('a JWT issued before the reset is rejected with 401 TOKEN_INVALIDO', async () => {
      const { token: jwtViejo } = await preparar();
      await solicitar();
      expect((await request(app).get('/api/users/profile').set('Authorization', `Bearer ${jwtViejo}`)).status).toBe(200);
      await restablecer(cuerpo(tokenDelCorreo()));
      const res = await request(app).get('/api/users/profile').set('Authorization', `Bearer ${jwtViejo}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_INVALIDO');
    });

    it('400 VALIDACION_FALLIDA without a token', async () => {
      const res = await restablecer({ nuevaPassword: NUEVA, confirmarPassword: NUEVA });
      expect(res.status).toBe(400);
    });

    it('429 DEMASIADAS_SOLICITUDES on the 11th request from one IP', async () => {
      for (let i = 0; i < 10; i++) expect((await restablecer(cuerpo('desconocido'))).status).toBe(400);
      const res = await restablecer(cuerpo('desconocido'));
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('DEMASIADAS_SOLICITUDES');
    });
  });

  it('the recovery API routes are no longer 501 stubs', async () => {
    const respuestas = await Promise.all([
      request(app).post('/api/auth/recuperar').send({ email: registro.email }),
      request(app).get('/api/auth/restablecer/validar').query({ token: 'x' }),
      request(app).post('/api/auth/restablecer').send({ token: 'x', nuevaPassword: NUEVA, confirmarPassword: NUEVA }),
    ]);
    expect(respuestas.map((r) => r.status)).not.toContain(501);
  });
});
