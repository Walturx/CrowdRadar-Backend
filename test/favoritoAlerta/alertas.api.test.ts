/**
 * API tests of the in-app alerts (spec M3 R6, S22-S24; frontend contract AlertaRepositoryHttp):
 * GET /api/alertas and PATCH /api/alertas/:id/leida against the fake container (no database).
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aUsuario } from '../support/fabrica/datos.js';

const T0 = new Date('2026-10-05T14:00:00Z');
const minutos = (n: number) => new Date(T0.getTime() + n * 60_000);

describe('alertas (contenedor de prueba)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let usuarioId: number;
  let auth: { Authorization: string };
  let lugarId: number;

  const nuevoUsuario = () => {
    const usuario = ctx.usuarioDAO.agregar(aUsuario());
    return { id: usuario.id, auth: { Authorization: `Bearer ${ctx.emisorToken.emitir(usuario).token}` } };
  };
  const alertar = (destinatario: number, fechaHora: Date, nivelAnterior: NivelSaturacion | null = NivelSaturacion.MODERADO) =>
    ctx.alertaDAO.crear({
      favoritoId: 1,
      usuarioId: destinatario,
      lugarId,
      nivelAnterior,
      nivelNuevo: NivelSaturacion.SATURADO,
      mensaje: 'Parque Kennedy ahora está Saturado.',
      fechaHora,
    });

  beforeEach(() => {
    ctx = crearContenedorPrueba();
    app = createApp(ctx.contenedor);
    ({ id: usuarioId, auth } = nuevoUsuario());
    lugarId = ctx.lugarDAO.agregar({ nombre: 'Parque Kennedy' }).id;
  });

  describe('GET /api/alertas', () => {
    it('sin token responde 401 NO_AUTENTICADO', async () => {
      const res = await request(app).get('/api/alertas');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    it('sin alertas: 200 con mensaje "No tienes alertas.", lista vacia y noLeidas 0', async () => {
      await alertar(nuevoUsuario().id, T0);
      const res = await request(app).get('/api/alertas').set(auth);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('No tienes alertas.');
      expect(res.body.data).toEqual({ items: [], page: 1, size: 20, total: 0, totalPaginas: 0, noLeidas: 0 });
    });

    it('lista las propias con los campos exactos del contrato, la mas nueva primero, y noLeidas', async () => {
      const vieja = await alertar(usuarioId, T0);
      const nueva = await alertar(usuarioId, minutos(5), null);
      await alertar(nuevoUsuario().id, minutos(9));
      const res = await request(app).get('/api/alertas').set(auth);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Alertas obtenidas correctamente.');
      expect(res.body.data).toMatchObject({ page: 1, size: 20, total: 2, totalPaginas: 1, noLeidas: 2 });
      expect(res.body.data.items).toEqual([
        {
          id: nueva.id,
          lugarId,
          lugarNombre: 'Parque Kennedy',
          nivelAnterior: 'SIN_INFORMACION',
          nivelNuevo: 'SATURADO',
          mensaje: 'Parque Kennedy ahora está Saturado.',
          leida: false,
          fechaHora: minutos(5).toISOString(),
        },
        {
          id: vieja.id,
          lugarId,
          lugarNombre: 'Parque Kennedy',
          nivelAnterior: 'MODERADO',
          nivelNuevo: 'SATURADO',
          mensaje: 'Parque Kennedy ahora está Saturado.',
          leida: false,
          fechaHora: T0.toISOString(),
        },
      ]);
    });

    it('pagina con page y size y noLeidas cuenta todas, no solo la pagina', async () => {
      for (let i = 0; i < 3; i += 1) await alertar(usuarioId, minutos(i));
      const res = await request(app).get('/api/alertas?page=2&size=2').set(auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ page: 2, size: 2, total: 3, totalPaginas: 2, noLeidas: 3 });
      expect(res.body.data.items).toHaveLength(1);
    });

    it.each([
      ['size=0', 'size'],
      ['size=51', 'size'],
      ['size=abc', 'size'],
      ['page=0', 'page'],
      ['page=-1', 'page'],
      ['page=1.5', 'page'],
    ])('?%s responde 400 VALIDACION_FALLIDA indicando el campo', async (consulta, campo) => {
      const res = await request(app).get(`/api/alertas?${consulta}`).set(auth);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain(campo);
    });

    it.each(['size=1', 'size=50'])('?%s (limite valido) responde 200', async (consulta) => {
      const res = await request(app).get(`/api/alertas?${consulta}`).set(auth);
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/alertas/:id/leida', () => {
    it('sin token responde 401', async () => {
      const res = await request(app).patch('/api/alertas/1/leida');
      expect(res.status).toBe(401);
    });

    it('200: marca la propia, devuelve la alerta con leida=true y baja noLeidas (S23)', async () => {
      const alerta = await alertar(usuarioId, T0);
      await alertar(usuarioId, minutos(1));
      const res = await request(app).patch(`/api/alertas/${alerta.id}/leida`).set(auth);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Alerta marcada como leída.');
      expect(res.body.data).toMatchObject({ id: alerta.id, lugarNombre: 'Parque Kennedy', leida: true });
      expect((await request(app).get('/api/alertas').set(auth)).body.data.noLeidas).toBe(1);
    });

    it('es idempotente: repetirlo tambien responde 200', async () => {
      const alerta = await alertar(usuarioId, T0);
      await request(app).patch(`/api/alertas/${alerta.id}/leida`).set(auth);
      const res = await request(app).patch(`/api/alertas/${alerta.id}/leida`).set(auth);
      expect(res.status).toBe(200);
      expect(res.body.data.leida).toBe(true);
    });

    it('404 ALERTA_NO_ENCONTRADA para una alerta ajena (S24) y para una inexistente, y no la marca', async () => {
      const otro = nuevoUsuario();
      const ajena = await alertar(otro.id, T0);
      const res = await request(app).patch(`/api/alertas/${ajena.id}/leida`).set(auth);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ALERTA_NO_ENCONTRADA');
      expect((await request(app).patch('/api/alertas/4242/leida').set(auth)).body.code).toBe('ALERTA_NO_ENCONTRADA');
      expect(await ctx.alertaDAO.contarNoLeidas(otro.id)).toBe(1);
    });

    it.each(['abc', '0', '-3', '1.5', '2147483648'])('id=%s responde 400 VALIDACION_FALLIDA', async (id) => {
      const res = await request(app).patch(`/api/alertas/${id}/leida`).set(auth);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors[0].campo).toBe('id');
    });
  });
});
