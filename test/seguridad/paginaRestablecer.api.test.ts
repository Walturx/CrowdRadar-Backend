/**
 * GET /recuperar/restablecer?token: the page served by the backend (ADR 14). Spec M1 R3; HU 2.2 c1-c3.
 * Fake container, mail spy, pinned clock; the page is checked as served HTML (form present or absent).
 */
import { createHash } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { crearLoggerEspia, type LineaLog } from '../support/LoggerEspia.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { esperar503Reintentable } from '../support/erroresBD.js';
import { asentar } from './entornoRecuperacion.js';

const registro = { nombre: 'Ana', apellido: 'Ruiz', email: 'ana.ruiz@crowdradar.pe', password: 'Vieja1234', telefono: '', distrito: 'Miraflores' };
const MENSAJE_CADUCADO = 'El enlace ha caducado o no es válido';
const MENSAJE_EXITO = 'Contraseña restablecida';

describe('GET /recuperar/restablecer (pagina de restablecimiento)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let reloj: RelojFijo;
  let lineas: LineaLog[];

  const pagina = (token?: string) => request(app).get('/recuperar/restablecer').query(token === undefined ? {} : { token });
  const tokenVivo = async () => {
    await request(app).post('/api/auth/recuperar').send({ email: registro.email });
    return /token=([^\s"&]+)/.exec(ctx.correo.enviados.at(-1)!.texto)![1]!;
  };

  beforeEach(async () => {
    reloj = new RelojFijo(new Date('2026-10-05T14:00:00Z'));
    const espia = crearLoggerEspia();
    lineas = espia.lineas;
    ctx = crearContenedorPrueba({ reloj, usuarioDAO: new UsuarioDAOMemoria({ reloj }), logger: espia.logger });
    app = createApp(ctx.contenedor);
    await request(app).post('/api/auth/register').send(registro);
  });

  describe('valid token (c1)', () => {
    it('200 HTML with the form: new password and confirmation, posting to the API', async () => {
      const res = await pagina(await tokenVivo());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('<form');
      expect(res.text).toMatch(/name="nuevaPassword"/);
      expect(res.text).toMatch(/name="confirmarPassword"/);
      expect(res.text).toContain('/api/auth/restablecer');
      expect(res.text).toMatch(/id="caducado"[^>]*hidden/); // the error block exists only to be shown after a failed submit
    });

    it('carries the success text the page shows after a successful reset (c2)', async () => {
      const res = await pagina(await tokenVivo());
      expect(res.text).toContain(MENSAJE_EXITO);
      expect(res.text).toContain('iniciar sesión');
    });

    it('does not echo the token and tells browsers not to cache it nor leak it in a Referer', async () => {
      const token = await tokenVivo();
      const res = await pagina(token);
      expect(res.text).not.toContain(token);
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    });

    it('its CSP allows exactly the inline script of the page (by hash) and no other script', async () => {
      const res = await pagina(await tokenVivo());
      const script = /<script>([\s\S]*?)<\/script>/.exec(res.text)![1]!;
      const hash = createHash('sha256').update(script).digest('base64');
      const csp = String(res.headers['content-security-policy']);
      expect(csp).toContain(`script-src 'sha256-${hash}'`);
      expect(csp).not.toContain("'unsafe-inline'; script");
    });
  });

  describe('invalid or expired token (c3)', () => {
    it('unknown token: no form, the caducado message, status 400', async () => {
      const res = await pagina('desconocido');
      expect(res.status).toBe(400);
      expect(res.text).not.toContain('<form');
      expect(res.text).toContain(MENSAJE_CADUCADO);
    });

    it('missing token: the same page', async () => {
      const res = await pagina();
      expect(res.status).toBe(400);
      expect(res.text).not.toContain('<form');
      expect(res.text).toContain(MENSAJE_CADUCADO);
    });

    it('expired token: no form, the caducado message, status 410', async () => {
      const token = await tokenVivo();
      reloj.avanzarMinutos(31);
      const res = await pagina(token);
      expect(res.status).toBe(410);
      expect(res.text).not.toContain('<form');
      expect(res.text).toContain(MENSAJE_CADUCADO);
    });

    it('used token: no form', async () => {
      const token = await tokenVivo();
      await request(app).post('/api/auth/restablecer').send({ token, nuevaPassword: 'Nueva12345', confirmarPassword: 'Nueva12345' });
      const res = await pagina(token);
      expect(res.status).toBe(400);
      expect(res.text).not.toContain('<form');
    });

    it('an invalid-token page is HTML too and shows the message inside a visible element', async () => {
      const res = await pagina('x');
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toMatch(/<(p|h1|div)[^>]*>[^<]*El enlace ha caducado o no es válido/);
    });
  });

  describe('the token never reaches the logs', () => {
    it('neither the page, the validation endpoint nor the reset endpoint log it', async () => {
      const token = await tokenVivo();
      await pagina(token);
      await request(app).get('/api/auth/restablecer/validar').query({ token });
      await request(app).post('/api/auth/restablecer').send({ token, nuevaPassword: 'Nueva12345', confirmarPassword: 'Nueva12345' });
      await asentar();
      expect(lineas.length).toBeGreaterThan(0);
      expect(JSON.stringify(lineas)).not.toContain(token);
    });
  });

  it('a database outage while checking the token is 503 SERVICIO_NO_DISPONIBLE with Retry-After, not the expired-link page', async () => {
    const token = await tokenVivo();
    vi.spyOn(ctx.tokenDAO, 'buscarPorHash').mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }));
    const res = await pagina(token);
    esperar503Reintentable(res);
    expect(res.text).not.toContain(MENSAJE_CADUCADO);
    expect((await pagina(token)).status).toBe(200);
  });

  it('the page is rate limited per IP like the reset endpoint (R1-1306): the 11th view is a 429', async () => {
    for (let i = 0; i < 10; i++) expect((await pagina('x')).status).not.toBe(429);
    const res = await pagina('x');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});
