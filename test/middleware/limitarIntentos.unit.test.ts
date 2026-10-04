/** limitarIntentos: rate limiting keyed by IP (+ email). Spec R-A8.1. */
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    const app = appCon({ max: 3, ventanaMs: VENTANA, clave: 'ip+email' });
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
    const app = appCon({ max: 2, ventanaMs: VENTANA, clave: 'ip+email' });
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

  it('por defecto cuenta TODOS los intentos, tambien los exitosos (R1-401)', async () => {
    const app = appCon({ max: 2, ventanaMs: VENTANA });
    const enviar = (ok: boolean) => request(app).post('/login').send({ email: 'a@x.pe', ok });

    expect((await enviar(true)).status).toBe(200);
    expect((await enviar(true)).status).toBe(200);
    expect((await enviar(true)).status).toBe(429);
  });

  it('soloFallidos: los intentos exitosos no consumen el cupo, los fallidos si', async () => {
    const app = appCon({ max: 2, ventanaMs: VENTANA, clave: 'ip+email', soloFallidos: true });
    const enviar = (ok: boolean) => request(app).post('/login').send({ email: 'a@x.pe', ok });

    expect((await enviar(true)).status).toBe(200);
    expect((await enviar(true)).status).toBe(200);
    expect((await enviar(true)).status).toBe(200);
    expect((await enviar(false)).status).toBe(401);
    expect((await enviar(false)).status).toBe(401);
    expect((await enviar(true)).status).toBe(429);
  });

  describe('clave por email (bloqueo de cuenta, R1-401)', () => {
    const appBloqueo = () => appCon({ max: 3, ventanaMs: VENTANA, clave: 'email', soloFallidos: true, bloqueo: true });
    const enviar = (app: ReturnType<typeof appBloqueo>, email: string, ok = false, ip = '1.1.1.1') =>
      request(app).post('/login').set('X-Forwarded-For', ip).send({ email, ok });

    it('cuenta los fallos por email sin importar la IP y bloquea con 429 DEMASIADOS_INTENTOS + Retry-After', async () => {
      const app = appBloqueo();
      for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) expect((await enviar(app, 'a@x.pe', false, ip)).status).toBe(401);

      const bloqueado = await enviar(app, 'a@x.pe', true, '4.4.4.4');
      expect(bloqueado.status).toBe(429);
      expect(bloqueado.body.code).toBe('DEMASIADOS_INTENTOS');
      const reintento = Number(bloqueado.headers['retry-after']);
      expect(reintento).toBeGreaterThan(0);
      expect(reintento).toBeLessThanOrEqual(VENTANA / 1000);
    });

    it('otro email no se ve afectado, las mayusculas no evaden el bloqueo y los exitosos no cuentan', async () => {
      const app = appBloqueo();
      for (let i = 0; i < 5; i += 1) expect((await enviar(app, 'ok@x.pe', true)).status).toBe(200);
      for (const email of ['a@x.pe', 'A@X.PE', ' a@x.pe ']) expect((await enviar(app, email)).status).toBe(401);
      expect((await enviar(app, 'a@X.pe')).status).toBe(429);
      expect((await enviar(app, 'b@x.pe', true)).status).toBe(200);
    });

    it('sin email en el cuerpo no se aplica el bloqueo (no se agrupa a todos los anonimos en una clave)', async () => {
      const app = appBloqueo();
      for (let i = 0; i < 6; i += 1) {
        expect((await request(app).post('/login').send({ ok: false })).status).toBe(401);
      }
    });
  });

  describe('expiracion de la ventana (R3-407)', () => {
    afterEach(() => vi.useRealTimers());

    it('al vencer la ventana el contador se reinicia y el Retry-After del 429 refleja el tiempo restante', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
      const app = appCon({ max: 1, ventanaMs: VENTANA });
      const enviar = () => request(app).post('/login').send({ ok: true });

      expect((await enviar()).status).toBe(200);
      vi.setSystemTime(new Date('2026-10-05T10:05:00Z'));
      const bloqueado = await enviar();
      expect(bloqueado.status).toBe(429);
      expect(bloqueado.headers['retry-after']).toBe('600');

      vi.setSystemTime(new Date('2026-10-05T10:15:01Z'));
      expect((await enviar()).status).toBe(200);
    });
  });

  it('cada limitador tiene su propio contador (instancias independientes)', async () => {
    const primera = appCon({ max: 1, ventanaMs: VENTANA });
    const segunda = appCon({ max: 1, ventanaMs: VENTANA });
    expect((await request(primera).post('/login').send({ ok: true })).status).toBe(200);
    expect((await request(primera).post('/login').send({ ok: true })).status).toBe(429);
    expect((await request(segunda).post('/login').send({ ok: true })).status).toBe(200);
  });
});
