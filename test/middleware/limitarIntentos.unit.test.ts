/** limitarIntentos: rate limiting keyed by IP (+ email). Spec R-A8.1. */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { limitarIntentos } from '../../src/middleware/limitarIntentos.js';
import { crearAppPrueba } from '../support/appPrueba.js';

const VENTANA = 15 * 60 * 1000;

/** POST /login answers 200 when body.ok is true and 401 otherwise. */
const appCon = (opciones: Parameters<typeof limitarIntentos>[0]) =>
  crearAppPrueba({
    montar: (app) => {
      app.post('/login', limitarIntentos(opciones), (req, res) => {
        res.status(req.body.ok ? 200 : 401).json({ ok: Boolean(req.body.ok) });
      });
    },
  });

describe('limitarIntentos', () => {
  it('permite hasta el maximo y el siguiente intento -> 429 DEMASIADAS_SOLICITUDES', async () => {
    const app = appCon({ max: 3, ventanaMs: VENTANA, claveEmail: true });
    const enviar = () => request(app).post('/login').send({ email: 'a@x.pe', ok: true });

    for (let intento = 1; intento <= 3; intento += 1) {
      expect((await enviar()).status, `intento ${intento}`).toBe(200);
    }
    const bloqueado = await enviar();
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body).toEqual({
      message: 'Demasiadas solicitudes. Inténtalo más tarde.',
      code: 'DEMASIADAS_SOLICITUDES',
      errors: [],
    });
  });

  it('con claveEmail el limite es por IP+email: otro email no se ve afectado y las mayusculas no evaden el limite', async () => {
    const app = appCon({ max: 2, ventanaMs: VENTANA, claveEmail: true });
    const enviar = (email: string) => request(app).post('/login').send({ email, ok: true });

    expect((await enviar('a@x.pe')).status).toBe(200);
    expect((await enviar('A@X.PE')).status).toBe(200);
    expect((await enviar(' a@x.pe ')).status).toBe(429);
    expect((await enviar('b@x.pe')).status).toBe(200);
  });

  it('sin claveEmail el limite es solo por IP', async () => {
    const app = appCon({ max: 2, ventanaMs: VENTANA });
    const enviar = (email: string) => request(app).post('/login').send({ email, ok: true });

    expect((await enviar('a@x.pe')).status).toBe(200);
    expect((await enviar('b@x.pe')).status).toBe(200);
    expect((await enviar('c@x.pe')).status).toBe(429);
  });

  it('soloFallidos: los intentos exitosos no consumen el cupo, los fallidos si', async () => {
    const app = appCon({ max: 2, ventanaMs: VENTANA, claveEmail: true, soloFallidos: true });
    const enviar = (ok: boolean) => request(app).post('/login').send({ email: 'a@x.pe', ok });

    expect((await enviar(true)).status).toBe(200);
    expect((await enviar(true)).status).toBe(200);
    expect((await enviar(true)).status).toBe(200);
    expect((await enviar(false)).status).toBe(401);
    expect((await enviar(false)).status).toBe(401);
    expect((await enviar(true)).status).toBe(429);
  });

  it('cada limitador tiene su propio contador (instancias independientes)', async () => {
    const primera = appCon({ max: 1, ventanaMs: VENTANA });
    const segunda = appCon({ max: 1, ventanaMs: VENTANA });
    expect((await request(primera).post('/login').send({ ok: true })).status).toBe(200);
    expect((await request(primera).post('/login').send({ ok: true })).status).toBe(429);
    expect((await request(segunda).post('/login').send({ ok: true })).status).toBe(200);
  });
});
