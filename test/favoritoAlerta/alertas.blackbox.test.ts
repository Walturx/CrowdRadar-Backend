/**
 * Caja negra de la funcionalidad "Favoritos y alertas" (HU 8.3, con HU 8.1 que crea el favorito que se sigue).
 * Seis campos de entrada: lugarId (POST /api/favoritos), alertasActivadas (PATCH /api/favoritos/:lugarId/alertas),
 * token y plataforma del celular (POST /api/dispositivos, a donde llega el push) y page y size (GET /api/alertas).
 * Técnicas: particiones de equivalencia (PV válida, PI inválida) y valores límite (VL). Cada `it` es un caso CN-ALE.
 * El último bloque recorre el flujo completo: tres ciudadanos reportan, el nivel cambia y el seguidor recibe alerta y push.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { aUsuario } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const TOKEN_FCM = 'fcm-token-de-prueba:APA91b_x.1';

describe('Favoritos y alertas: 6 campos (caja negra, HU 8.3 y 8.1)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let auth: Record<string, string>;
  let lugarId: number;

  const sesionDe = () => {
    const usuario = ctx.usuarioDAO.agregar(aUsuario());
    return { id: usuario.id, auth: { Authorization: `Bearer ${ctx.emisorToken.emitir(usuario).token}` } };
  };
  const agregarFavorito = (cuerpo: Record<string, unknown>) => request(app).post('/api/favoritos').set(auth).send(cuerpo);
  const configurar = (lugar: number | string, cuerpo: Record<string, unknown>) =>
    request(app).patch(`/api/favoritos/${lugar}/alertas`).set(auth).send(cuerpo);
  const registrarCelular = (cuerpo: Record<string, unknown>) => request(app).post('/api/dispositivos').set(auth).send(cuerpo);
  const misAlertas = (consulta: string) => request(app).get(`/api/alertas?${consulta}`).set(auth);
  const esperarError = (res: request.Response, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  };
  /** Three other citizens report SATURADO, enough for the weighted strategy (3 reports) to change the level. */
  const tresReportesSaturado = async () => {
    for (let i = 0; i < 3; i++) {
      const otro = sesionDe();
      expect((await request(app).post('/api/reportes').set(otro.auth).send({ lugarId, nivel: 'SATURADO' })).status).toBe(201);
    }
  };

  beforeEach(() => {
    ctx = crearContenedorPrueba({ reloj: new RelojFijo(AHORA) });
    app = createApp(ctx.contenedor);
    auth = sesionDe().auth;
    lugarId = ctx.lugarDAO.agregar({ nombre: 'Parque Kennedy' }).id;
  });

  describe('campo 1 · lugarId (marcar favorito)', () => {
    it('CN-ALE-01 · PV · lugar existente → 201 con las alertas activadas por defecto', async () => {
      const res = await agregarFavorito({ lugarId });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ lugarId, alertasActivadas: true });
    });
    it('CN-ALE-02 · PI · el mismo lugar dos veces → 409 FAVORITO_DUPLICADO', async () => {
      await agregarFavorito({ lugarId });
      esperarError(await agregarFavorito({ lugarId }), 409, 'FAVORITO_DUPLICADO');
    });
    it('CN-ALE-03 · PI · lugar inexistente (999) → 404 LUGAR_NO_ENCONTRADO', async () => {
      esperarError(await agregarFavorito({ lugarId: 999 }), 404, 'LUGAR_NO_ENCONTRADO');
    });
    it('CN-ALE-04 · VL · lugarId = 0 → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await agregarFavorito({ lugarId: 0 }), 400, 'VALIDACION_FALLIDA');
    });
  });

  describe('campo 2 · alertasActivadas (configurar alertas del favorito)', () => {
    it('CN-ALE-05 · PV · false → 200 y el favorito deja de recibir alertas', async () => {
      await agregarFavorito({ lugarId });
      const res = await configurar(lugarId, { alertasActivadas: false });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ lugarId, alertasActivadas: false });
    });
    it('CN-ALE-06 · PV · true → 200 y vuelve a recibirlas', async () => {
      await agregarFavorito({ lugarId });
      await configurar(lugarId, { alertasActivadas: false });
      expect((await configurar(lugarId, { alertasActivadas: true })).body.data).toMatchObject({ alertasActivadas: true });
    });
    it('CN-ALE-07 · PI · texto "si" en lugar de booleano → 400 VALIDACION_FALLIDA', async () => {
      await agregarFavorito({ lugarId });
      esperarError(await configurar(lugarId, { alertasActivadas: 'si' }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-ALE-08 · PI · lugar que no es favorito del usuario → 404', async () => {
      const res = await configurar(lugarId, { alertasActivadas: false });
      expect(res.status).toBe(404);
    });
  });

  describe('campos 3 y 4 · token y plataforma del celular (para el push)', () => {
    it('CN-ALE-09 · PV · token válido y ANDROID → 201', async () => {
      expect((await registrarCelular({ token: TOKEN_FCM, plataforma: 'ANDROID' })).status).toBe(201);
    });
    it('CN-ALE-10 · PV · el mismo token otra vez, ahora IOS → 200 (se actualiza, no se duplica)', async () => {
      await registrarCelular({ token: TOKEN_FCM, plataforma: 'ANDROID' });
      expect((await registrarCelular({ token: TOKEN_FCM, plataforma: 'IOS' })).status).toBe(200);
    });
    it('CN-ALE-11 · PI · plataforma fuera del dominio ("WINDOWS") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await registrarCelular({ token: TOKEN_FCM, plataforma: 'WINDOWS' }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-ALE-12 · VL · token vacío ("") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await registrarCelular({ token: '', plataforma: 'ANDROID' }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-ALE-13 · VL · token de 255 caracteres (máximo) → 201', async () => {
      expect((await registrarCelular({ token: 'a'.repeat(255), plataforma: 'ANDROID' })).status).toBe(201);
    });
    it('CN-ALE-14 · VL · token de 256 caracteres → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await registrarCelular({ token: 'a'.repeat(256), plataforma: 'ANDROID' }), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-ALE-15 · PI · token con espacios ("abc def") → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await registrarCelular({ token: 'abc def', plataforma: 'ANDROID' }), 400, 'VALIDACION_FALLIDA');
    });
  });

  describe('campos 5 y 6 · page y size (bandeja de alertas)', () => {
    it('CN-ALE-16 · PV · sin alertas → 200 con «No tienes alertas.» y noLeidas 0', async () => {
      const res = await misAlertas('');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('No tienes alertas.');
      expect(res.body.data).toMatchObject({ items: [], noLeidas: 0 });
    });
    it('CN-ALE-17 · VL · page = 0 → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await misAlertas('page=0'), 400, 'VALIDACION_FALLIDA');
    });
    it('CN-ALE-18 · VL · size = 1 y size = 50 (mínimo y máximo) → 200', async () => {
      expect((await misAlertas('size=1')).status).toBe(200);
      expect((await misAlertas('size=50')).status).toBe(200);
    });
    it('CN-ALE-19 · VL · size = 51 → 400 VALIDACION_FALLIDA', async () => {
      esperarError(await misAlertas('size=51'), 400, 'VALIDACION_FALLIDA');
    });
  });

  describe('flujo completo de la HU 8.3 (todas las entradas juntas)', () => {
    it('CN-ALE-20 · PV · favorito con alertas + celular registrado + el nivel cambia → 1 alerta en la bandeja y 1 push al celular', async () => {
      await agregarFavorito({ lugarId });
      await registrarCelular({ token: TOKEN_FCM, plataforma: 'ANDROID' });
      await tresReportesSaturado();
      const res = await misAlertas('page=1&size=20');
      expect(res.status).toBe(200);
      expect(res.body.data.noLeidas).toBe(1);
      expect(res.body.data.items).toEqual([expect.objectContaining({ lugarId, nivelNuevo: 'SATURADO', leida: false })]);
      expect(ctx.notificador.llamadas).toEqual([
        expect.objectContaining({ tokens: [TOKEN_FCM], notificacion: expect.objectContaining({ titulo: 'Parque Kennedy' }) }),
      ]);
    });
    it('CN-ALE-21 · PI · mismo flujo pero con alertasActivadas = false → 0 alertas y 0 push', async () => {
      await agregarFavorito({ lugarId });
      await configurar(lugarId, { alertasActivadas: false });
      await registrarCelular({ token: TOKEN_FCM, plataforma: 'ANDROID' });
      await tresReportesSaturado();
      expect((await misAlertas('')).body.data.items).toEqual([]);
      expect(ctx.notificador.llamadas).toEqual([]);
    });
    it('CN-ALE-22 · PV · favorito con alertas pero sin celular → la alerta queda en la bandeja y no se intenta el push', async () => {
      await agregarFavorito({ lugarId });
      await tresReportesSaturado();
      expect((await misAlertas('')).body.data.noLeidas).toBe(1);
      expect(ctx.notificador.llamadas).toEqual([]);
    });
  });
});
