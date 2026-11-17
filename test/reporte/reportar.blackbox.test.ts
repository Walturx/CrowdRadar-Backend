/**
 * Caja negra de la funcionalidad "Reportar saturación y consultar mis reportes" (HU 4.1 y HU 4.3).
 * Cinco entradas: la sesión (cabecera Authorization), lugarId y nivel (POST /api/reportes), y page y size
 * (GET /api/reportes/mios). Para lugarId se agrega la clase "mismo lugar dentro del cooldown de 30 minutos".
 * Técnicas: particiones de equivalencia (PV válida, PI inválida) y valores límite (VL). Cada `it` es un caso CN-REP.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const haceMinutos = (n: number) => new Date(AHORA.getTime() - n * 60_000);

describe('Reportar y consultar mis reportes: 5 entradas (caja negra, HU 4.1 y 4.3)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let cabecera: Record<string, string>;
  let yo: number;
  let lugarId: number;

  const reportar = (cuerpo: Record<string, unknown>, cab: Record<string, string> = cabecera) =>
    request(app).post('/api/reportes').set(cab).send(cuerpo);
  const misReportes = (consulta: string) => request(app).get(`/api/reportes/mios?${consulta}`).set(cabecera);
  const esperarError = (res: request.Response, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  };
  /** Seeds n reports of mine, each in its own place, so the history has n rows. */
  const sembrarMisReportes = (n: number) => {
    for (let i = 0; i < n; i++) {
      const lugar = ctx.lugarDAO.agregar({ nombre: `Lugar ${i}` }).id;
      ctx.reporteDAO.agregar(aReporte({ usuarioId: yo, lugarId: lugar, fechaHora: haceMinutos(60 + i) }));
    }
  };

  beforeEach(() => {
    ctx = crearContenedorPrueba({ reloj: new RelojFijo(AHORA) });
    app = createApp(ctx.contenedor);
    const usuario = ctx.usuarioDAO.agregar(aUsuario());
    yo = usuario.id;
    cabecera = { Authorization: `Bearer ${ctx.emisorToken.emitir(usuario).token}` };
    lugarId = ctx.lugarDAO.agregar({ nombre: 'Larcomar' }).id;
  });

  describe('entrada 1 · sesión (Authorization)', () => {
    it('CN-REP-01 · PV · ciudadano con sesión activa → 201 y el reporte queda registrado', async () => {
      const res = await reportar({ lugarId, nivel: 'MODERADO' });
      expect(res.status).toBe(201);
      expect(res.body.data.reporte).toMatchObject({ lugarId, nivel: 'MODERADO' });
      expect(Object.keys(res.body.data).sort()).toEqual(['reporte', 'saturacionLugar']);
    });
    it('CN-REP-02 · PI · sin token → 401 NO_AUTENTICADO', async () => {
      esperarError(await reportar({ lugarId, nivel: 'MODERADO' }, {}), 401, 'NO_AUTENTICADO');
    });
    it('CN-REP-03 · PI · token mal formado → 401', async () => {
      const res = await reportar({ lugarId, nivel: 'MODERADO' }, { Authorization: 'Bearer no-es-un-jwt' });
      expect(res.status).toBe(401);
    });
    it('CN-REP-04 · PI · cuenta suspendida → 403 CUENTA_SUSPENDIDA', async () => {
      const suspendido = ctx.usuarioDAO.agregar(aUsuario({ status: EstadoCuenta.SUSPENDIDO }));
      await ctx.sancionDAO.crear({
        usuarioId: suspendido.id,
        administradorId: 1,
        dias: 3,
        motivo: 'Reportes falsos reiterados',
        fechaInicio: AHORA,
        fechaFin: new Date(AHORA.getTime() + 3 * 86_400_000),
      });
      const res = await reportar({ lugarId, nivel: 'MODERADO' }, { Authorization: `Bearer ${ctx.emisorToken.emitir(suspendido).token}` });
      esperarError(res, 403, 'CUENTA_SUSPENDIDA');
    });
  });

  describe('entrada 2 · lugarId', () => {
    it('CN-REP-05 · VL · lugarId = 0 (debe ser positivo) → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await reportar({ lugarId: 0, nivel: 'MODERADO' }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-REP-06 · PI · lugarId decimal (1.5) → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await reportar({ lugarId: 1.5, nivel: 'MODERADO' }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-REP-07 · PI · lugarId como texto ("1") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await reportar({ lugarId: String(lugarId), nivel: 'MODERADO' }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-REP-08 · PI · lugar que no existe (99999) → 404 LUGAR_NO_ENCONTRADO', async () => {
      esperarError(await reportar({ lugarId: 99999, nivel: 'MODERADO' }), 404, 'LUGAR_NO_ENCONTRADO');
    });
    it('CN-REP-09 · PI · mismo lugar reportado hace 29 min (cooldown de 30) → 422 REPORTE_EN_ESPERA con el tiempo que falta', async () => {
      ctx.reporteDAO.agregar(aReporte({ usuarioId: yo, lugarId, fechaHora: haceMinutos(29) }));
      const res = await reportar({ lugarId, nivel: 'SATURADO' });
      esperarError(res, 422, 'REPORTE_EN_ESPERA');
      expect(res.body.message).toBe('Ya reportaste este lugar. Vuelve a intentarlo en 1 minuto.');
    });
    it('CN-REP-10 · VL · mismo lugar reportado hace 30 min (límite del cooldown) → 201', async () => {
      ctx.reporteDAO.agregar(aReporte({ usuarioId: yo, lugarId, fechaHora: haceMinutos(30) }));
      expect((await reportar({ lugarId, nivel: 'SATURADO' })).status).toBe(201);
    });
  });

  describe('entrada 3 · nivel', () => {
    it.each(['TRANQUILO', 'MODERADO', 'SATURADO'])('CN-REP-11 · PV · nivel %s (dominio válido) → 201', async (nivel) => {
      const otro = ctx.lugarDAO.agregar({ nombre: `Lugar ${nivel}` }).id;
      expect((await reportar({ lugarId: otro, nivel })).status).toBe(201);
    });
    it('CN-REP-12 · PI · nivel fuera del dominio ("EXTREMO") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await reportar({ lugarId, nivel: 'EXTREMO' }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-REP-13 · PI · nivel en minúsculas ("moderado") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await reportar({ lugarId, nivel: 'moderado' }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-REP-14 · PI · sin nivel → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await reportar({ lugarId }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-REP-15 · PI · campo extra ("comentario") → 400 VALIDACION_FALLIDA (el cuerpo es estricto)', async () => {
      esperarError(await reportar({ lugarId, nivel: 'MODERADO', comentario: 'lleno' }), 400, 'VALIDACION_FALLIDA');
    });
  });

  describe('entradas 4 y 5 · page y size (historial)', () => {
    it('CN-REP-16 · PV · sin parámetros → 200 con page 1 y size 20 por defecto', async () => {
      sembrarMisReportes(3);
      const res = await misReportes('');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ page: 1, size: 20, total: 3 });
    });
    it('CN-REP-17 · VL · page = 0 (mínimo 1) → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await misReportes('page=0'), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-REP-18 · VL · size = 1 (mínimo) → 200 con 1 item', async () => {
      sembrarMisReportes(3);
      const res = await misReportes('size=1');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
    });
    it('CN-REP-19 · VL · size = 50 (máximo) → 200', async () => {
      expect((await misReportes('size=50')).status).toBe(200);
    });
    it('CN-REP-20 · VL · size = 51 → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await misReportes('size=51'), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-REP-21 · PI · page = "abc" → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await misReportes('page=abc'), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-REP-22 · PV · page = 2 con size = 2 y 3 reportes → 200 con el último reporte', async () => {
      sembrarMisReportes(3);
      const res = await misReportes('page=2&size=2');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ page: 2, size: 2, total: 3 });
      expect(res.body.data.items).toHaveLength(1);
    });
  });
});
