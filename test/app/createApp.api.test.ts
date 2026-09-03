/**
 * createApp mounts the full HTTP chain in order (spec A5.1, A6): helmet, CORS whitelist,
 * no x-powered-by, trust proxy from config, 100kb JSON, request ids, routers, 404 and the
 * error middleware last. Review rows R1-201, R4-205/R3-201, R4-206, R4-207, R4-208.
 */
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { crearContenedorPrueba, type OpcionesContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { EstadoServicio } from '../../src/util/EstadoServicio.js';
import { crearLoggerEspia } from '../support/LoggerEspia.js';

function crear(opciones: OpcionesContenedorPrueba = {}, extra?: (router: Router) => void) {
  const ctx = crearContenedorPrueba(opciones);
  const contenedor = { ...ctx.contenedor };
  if (extra) {
    const router = Router();
    extra(router);
    contenedor.rutas = [...contenedor.rutas, { modulo: 'prueba', ruta: '/prueba', router }];
  }
  return { ctx, app: createApp(contenedor) };
}

describe('cabeceras de seguridad', () => {
  it('helmet esta montado y x-powered-by no se anuncia (200, 404 y 401)', async () => {
    const { app } = crear();
    for (const ruta of ['/', '/no-existe', '/api/users/profile']) {
      const res = await request(app).get(ruta);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    }
  });
});

describe('CORS', () => {
  const cfg = { CORS_ORIGENES: 'https://app.crowdradar.pe, http://localhost:5173' };

  it('refleja solo los origenes configurados', async () => {
    const { app } = crear({ cfg });
    const permitido = await request(app).get('/').set('Origin', 'http://localhost:5173');
    expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const ajeno = await request(app).get('/').set('Origin', 'https://evil.example');
    expect(ajeno.status).toBe(200);
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('el preflight de un origen permitido se acepta y el de uno ajeno no recibe cabeceras CORS', async () => {
    const { app } = crear({ cfg });
    const ok = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://app.crowdradar.pe')
      .set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe('https://app.crowdradar.pe');
    const mal = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(mal.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('trust proxy y limite por IP', () => {
  const registrarDesde = (app: ReturnType<typeof crear>['app'], ip: string) =>
    request(app).post('/api/auth/register').set('X-Forwarded-For', ip).send({});

  it('por defecto TRUST_PROXY=false: X-Forwarded-For no cambia la clave del limite', async () => {
    const { app } = crear({ cfg: { LIMITE_REGISTRO: 1 } });
    expect(app.get('trust proxy')).toBe(false);
    expect((await registrarDesde(app, '1.1.1.1')).status).toBe(400);
    expect((await registrarDesde(app, '2.2.2.2')).status).toBe(429);
  });

  it('con TRUST_PROXY=1 cada IP de cliente reenviada tiene su propio contador', async () => {
    const { app } = crear({ cfg: { LIMITE_REGISTRO: 1, TRUST_PROXY: '1' } });
    expect(app.get('trust proxy')).toBe(1);
    expect((await registrarDesde(app, '1.1.1.1')).status).toBe(400);
    expect((await registrarDesde(app, '2.2.2.2')).status).toBe(400);
    expect((await registrarDesde(app, '1.1.1.1')).status).toBe(429);
  });
});

describe('cuerpos y errores de transporte', () => {
  it('JSON mal formado -> 400 JSON_INVALIDO con el sobre de error', async () => {
    const { app } = crear();
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'JSON_INVALIDO', errors: [] });
    expect(res.body.message).toEqual(expect.any(String));
  });

  it('cuerpo mayor a 100kb -> 413 con sobre de error', async () => {
    const { app } = crear();
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.pe', password: 'x'.repeat(150_000) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('VALIDACION_FALLIDA');
  });

  it('charset no soportado (body-parser 415) responde 415 y no 500', async () => {
    const { app } = crear();
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json; charset=desconocido-9')
      .send('{"email":"a@b.pe","password":"x"}');
    expect(res.status).toBe(415);
    expect(res.body).toMatchObject({ code: 'VALIDACION_FALLIDA', errors: [] });
  });

  it('Content-Encoding no soportado (body-parser 415) responde 415 y no 500', async () => {
    const { app } = crear();
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'desconocido')
      .send('{"email":"a@b.pe","password":"x"}');
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('VALIDACION_FALLIDA');
  });

  it('ruta desconocida -> 404 RUTA_NO_ENCONTRADA con el sobre de error (no HTML)', async () => {
    const { app } = crear();
    const res = await request(app).get('/api/inexistente');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toMatchObject({ code: 'RUTA_NO_ENCONTRADA', errors: [] });
  });
});

describe('errores 500 y request id', () => {
  const boom = (router: Router) =>
    router.get('/boom', () => {
      throw new Error('detalle interno secreto');
    });

  it('el 500 trae requestId (igual al X-Request-Id), no trae stack ni detalle interno', async () => {
    const { app } = crear({ logger: crearLoggerEspia('silent').logger }, boom);
    const res = await request(app).get('/prueba/boom').set('X-Request-Id', 'req-abc-123');
    expect(res.status).toBe(500);
    expect(res.headers['x-request-id']).toBe('req-abc-123');
    expect(res.body).toEqual({
      message: 'Error interno del servidor.',
      code: 'ERROR_INTERNO',
      errors: [],
      requestId: 'req-abc-123',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/secreto|stack|at /);
  });

  it('sin cabecera se genera un requestId y coincide con el de la respuesta', async () => {
    const { app } = crear({ logger: crearLoggerEspia('silent').logger }, boom);
    const res = await request(app).get('/prueba/boom');
    expect(res.body.requestId).toEqual(expect.any(String));
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('los errores esperados (4xx) no llevan requestId', async () => {
    const { app } = crear();
    const res = await request(app).get('/api/inexistente');
    expect(res.body).not.toHaveProperty('requestId');
  });

  it('registra una linea por peticion con su reqId (pino-http montado)', async () => {
    const espia = crearLoggerEspia('info');
    const { app } = crear({ logger: espia.logger });
    await request(app).get('/').set('X-Request-Id', 'traza-1');
    expect(espia.lineas.some((l) => l.reqId === 'traza-1')).toBe(true);
  });
});

describe('registro de peticiones rechazadas por el parser (R3-406)', () => {
  const estatusDe = (lineas: ReturnType<typeof crearLoggerEspia>['lineas'], status: number) =>
    lineas.find((l) => (l.res as { statusCode?: number } | undefined)?.statusCode === status);

  it('JSON mal formado deja una linea de log 400 con reqId', async () => {
    const espia = crearLoggerEspia('info');
    const { app } = crear({ logger: espia.logger });
    await request(app)
      .post('/api/auth/login')
      .set('X-Request-Id', 'traza-400')
      .set('Content-Type', 'application/json')
      .send('{bad');
    const linea = estatusDe(espia.lineas, 400);
    expect(linea?.reqId).toBe('traza-400');
    expect(linea?.req).toMatchObject({ method: 'POST', url: '/api/auth/login' });
  });

  it('cuerpo demasiado grande deja una linea de log 413', async () => {
    const espia = crearLoggerEspia('info');
    const { app } = crear({ logger: espia.logger });
    await request(app).post('/api/auth/login').send({ password: 'x'.repeat(150_000) });
    expect(estatusDe(espia.lineas, 413)).toBeDefined();
  });

  it('charset no soportado deja una linea de log 415', async () => {
    const espia = crearLoggerEspia('info');
    const { app } = crear({ logger: espia.logger });
    await request(app).post('/api/auth/login').set('Content-Type', 'application/json; charset=desconocido-9').send('{}');
    expect(estatusDe(espia.lineas, 415)).toBeDefined();
  });
});

describe('GET /api/salud', () => {
  it('el estado compartido con el apagado llega al router: 503 APAGANDO', async () => {
    const estado = new EstadoServicio();
    const { app } = crear({ estado });
    expect((await request(app).get('/api/salud')).status).toBe(200);
    estado.marcarApagando();
    const res = await request(app).get('/api/salud');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('APAGANDO');
  });

  it('200 cuando la base de datos responde', async () => {
    const { app, ctx } = crear();
    const res = await request(app).get('/api/salud');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Servicio disponible.', data: { estado: 'OK' } });
    expect(ctx.conexion.verificaciones).toBe(1);
  });

  it('503 SERVICIO_NO_DISPONIBLE cuando verificar() falla', async () => {
    const { app } = crear({ conexion: new ConexionFalsa(new Error('connect ECONNREFUSED')) });
    const res = await request(app).get('/api/salud');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'SERVICIO_NO_DISPONIBLE', errors: [] });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });
});
