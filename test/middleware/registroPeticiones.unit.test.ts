/** Request id and pino-http request logging (spec R-A5.1: pino-http with redaction). */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearRegistroPeticiones } from '../../src/middleware/registroPeticiones.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';

function crearApp() {
  const espia = crearLoggerEspia('info');
  const app = express();
  app.use(crearRegistroPeticiones(espia.logger));
  app.get('/ok', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/mal', (_req, res) => {
    res.status(500).json({ ok: false });
  });
  app.get('/no', (_req, res) => {
    res.status(404).json({ ok: false });
  });
  return { app, ...espia };
}

describe('registroPeticiones: request id', () => {
  it('genera un X-Request-Id (uuid) cuando el cliente no envia uno', async () => {
    const { app } = crearApp();
    const res = await request(app).get('/ok');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('dos peticiones reciben ids distintos', async () => {
    const { app } = crearApp();
    const primera = await request(app).get('/ok');
    const segunda = await request(app).get('/ok');
    expect(primera.headers['x-request-id']).not.toBe(segunda.headers['x-request-id']);
  });

  it('reutiliza el id del cliente cuando es seguro', async () => {
    const { app } = crearApp();
    const res = await request(app).get('/ok').set('X-Request-Id', 'abc-123_DEF');
    expect(res.headers['x-request-id']).toBe('abc-123_DEF');
  });

  it('descarta un id del cliente con caracteres peligrosos o demasiado largo', async () => {
    const { app } = crearApp();
    const peligroso = await request(app).get('/ok').set('X-Request-Id', 'a b"{injected}');
    expect(peligroso.headers['x-request-id']).not.toBe('a b"{injected}');
    const largo = await request(app).get('/ok').set('X-Request-Id', 'a'.repeat(100));
    expect(largo.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('registroPeticiones: log de cada peticion', () => {
  it('registra id, metodo, ruta y status de la respuesta', async () => {
    const { app, lineas } = crearApp();
    const res = await request(app).get('/ok?x=1');
    const linea = lineas.find((l) => (l.res as { statusCode?: number } | undefined)?.statusCode === 200);
    expect(linea).toBeDefined();
    expect(linea?.reqId).toBe(res.headers['x-request-id']);
    expect(linea?.req).toMatchObject({ method: 'GET', url: '/ok?x=1' });
  });

  it('nunca escribe cabeceras: la autorizacion no llega a los logs', async () => {
    const { app, lineas } = crearApp();
    await request(app).get('/ok').set('Authorization', 'Bearer super-secreto-jwt').set('Cookie', 'sesion=xyz');
    const texto = JSON.stringify(lineas);
    expect(lineas.length).toBeGreaterThan(0);
    expect(texto).not.toContain('super-secreto-jwt');
    expect(texto).not.toContain('sesion=xyz');
  });

  it('usa el nivel segun el status: info 2xx, warn 4xx, error 5xx', async () => {
    const { app, lineas } = crearApp();
    await request(app).get('/ok');
    await request(app).get('/no');
    await request(app).get('/mal');
    const nivelDe = (status: number) =>
      lineas.find((l) => (l.res as { statusCode?: number } | undefined)?.statusCode === status)?.level;
    expect(nivelDe(200)).toBe(30);
    expect(nivelDe(404)).toBe(40);
    expect(nivelDe(500)).toBe(50);
  });
});
