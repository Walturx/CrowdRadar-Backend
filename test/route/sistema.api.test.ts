/** GET /api/salud: readiness during shutdown (R4-410) and a bounded database probe (R4-412). */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearSistemaRouter, TIMEOUT_SALUD_MS } from '../../src/route/sistema.routes.js';
import { EstadoServicio } from '../../src/util/EstadoServicio.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { crearAppPrueba } from '../support/appPrueba.js';

const appCon = (conexion: ConexionFalsa, estado = new EstadoServicio(), timeoutMs?: number) =>
  crearAppPrueba({ montar: (app) => void app.use('/', crearSistemaRouter(conexion, estado, timeoutMs)) });

describe('GET /api/salud', () => {
  it('el limite por defecto de la sonda es 2 segundos', () => {
    expect(TIMEOUT_SALUD_MS).toBe(2000);
  });

  it('200 mientras el servicio atiende y la base responde', async () => {
    const res = await request(appCon(new ConexionFalsa())).get('/api/salud');
    expect(res.status).toBe(200);
  });

  it('503 APAGANDO con Retry-After en cuanto empieza el apagado, sin consultar la base', async () => {
    const conexion = new ConexionFalsa();
    const estado = new EstadoServicio();
    estado.marcarApagando();
    const res = await request(appCon(conexion, estado)).get('/api/salud');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: 'El servicio se está apagando.', code: 'APAGANDO', errors: [] });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(conexion.verificaciones).toBe(0);
  });

  it('503 SERVICIO_NO_DISPONIBLE si la base no responde dentro del limite (pool agotado, sin esperar el acquire)', async () => {
    const conexion = new ConexionFalsa();
    conexion.verificacionColgada = true;
    const inicio = Date.now();
    const res = await request(appCon(conexion, new EstadoServicio(), 60)).get('/api/salud');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICIO_NO_DISPONIBLE');
    expect(Date.now() - inicio).toBeLessThan(1500);
  });

  it('un rechazo tardio de la sonda ya abandonada no provoca una promesa rechazada sin manejar', async () => {
    const conexion = new ConexionFalsa();
    let rechazarSonda: (error: Error) => void = () => undefined;
    conexion.verificar = () => new Promise<void>((_ok, rechazar) => void (rechazarSonda = rechazar));
    const noManejadas: unknown[] = [];
    const oyente = (razon: unknown) => void noManejadas.push(razon);
    process.on('unhandledRejection', oyente);
    try {
      const res = await request(appCon(conexion, new EstadoServicio(), 30)).get('/api/salud');
      expect(res.status).toBe(503);
      rechazarSonda(new Error('tarde'));
      await new Promise((resolver) => setTimeout(resolver, 20));
      expect(noManejadas).toEqual([]);
    } finally {
      process.off('unhandledRejection', oyente);
    }
  });

  it('503 SERVICIO_NO_DISPONIBLE si la base falla rapido', async () => {
    const res = await request(appCon(new ConexionFalsa(new Error('connect ECONNREFUSED')))).get('/api/salud');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICIO_NO_DISPONIBLE');
  });
});
