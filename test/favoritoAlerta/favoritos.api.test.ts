/**
 * API tests of the favourites (spec M3 R1-R4, S1-S14; frontend contract FavoritoRepositoryHttp):
 * GET/POST /api/favoritos, DELETE /api/favoritos/:lugarId, PATCH /api/favoritos/:lugarId/alertas
 * against the fake container (no database).
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aUsuario } from '../support/fabrica/datos.js';
import { esperar503Reintentable, statementTimeout } from '../support/erroresBD.js';

const haceMin = (min: number) => new Date(Date.now() - min * 60_000);

describe('favoritos (contenedor de prueba)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let auth: { Authorization: string };
  let usuarioId: number;
  let lugarId: number;

  const nuevoUsuario = () => {
    const usuario = ctx.usuarioDAO.agregar(aUsuario());
    return { id: usuario.id, auth: { Authorization: `Bearer ${ctx.emisorToken.emitir(usuario).token}` } };
  };

  beforeEach(() => {
    ctx = crearContenedorPrueba();
    app = createApp(ctx.contenedor);
    ({ id: usuarioId, auth } = nuevoUsuario());
    lugarId = ctx.lugarDAO.agregar({
      nombre: 'Parque Kennedy',
      saturacionActual: NivelSaturacion.MODERADO,
      saturacionActualizadaEn: haceMin(5),
    }).id;
  });

  describe('sin token', () => {
    it.each([
      ['get', '/api/favoritos'],
      ['post', '/api/favoritos'],
      ['delete', '/api/favoritos/1'],
      ['patch', '/api/favoritos/1/alertas'],
    ] as const)('%s %s responde 401 NO_AUTENTICADO', async (metodo, ruta) => {
      const res = await request(app)[metodo](ruta);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });
  });

  describe('POST /api/favoritos', () => {
    it('201 con el favorito completo y las alertas activadas (S1)', async () => {
      const res = await request(app).post('/api/favoritos').set(auth).send({ lugarId });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        message: 'Añadido a favoritos',
        data: { lugarId, nombre: 'Parque Kennedy', categoria: 'PARQUE', saturacion: 'MODERADO', alertasActivadas: true },
      });
      expect(await ctx.favoritoDAO.buscar(usuarioId, lugarId)).not.toBeNull();
    });

    it('el detalle del lugar pasa a mostrar esFavorito (S6)', async () => {
      await request(app).post('/api/favoritos').set(auth).send({ lugarId });
      const detalle = await request(app).get(`/api/lugares/${lugarId}`).set(auth);
      expect(detalle.body.data).toMatchObject({ esFavorito: true, alertasActivadas: true });
    });

    it('409 FAVORITO_DUPLICADO con el mensaje de HU 8.1 y una sola fila (S2)', async () => {
      await request(app).post('/api/favoritos').set(auth).send({ lugarId });
      const res = await request(app).post('/api/favoritos').set(auth).send({ lugarId });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'FAVORITO_DUPLICADO', message: 'Este lugar ya pertenece a tus favoritos.' });
      expect(await ctx.favoritoDAO.listarPorUsuario(usuarioId)).toHaveLength(1);
    });

    it('un statement_timeout al guardar es 503 SERVICIO_NO_DISPONIBLE con Retry-After, no 409 ni 500', async () => {
      vi.spyOn(ctx.favoritoDAO, 'crear').mockRejectedValueOnce(statementTimeout());
      esperar503Reintentable(await request(app).post('/api/favoritos').set(auth).send({ lugarId }));
      expect(await ctx.favoritoDAO.buscar(usuarioId, lugarId)).toBeNull();
    });

    it('dos peticiones en paralelo: una 201 y una 409, una sola fila (S5)', async () => {
      const respuestas = await Promise.all([
        request(app).post('/api/favoritos').set(auth).send({ lugarId }),
        request(app).post('/api/favoritos').set(auth).send({ lugarId }),
      ]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await ctx.favoritoDAO.listarPorUsuario(usuarioId)).toHaveLength(1);
    });

    it('404 LUGAR_NO_ENCONTRADO para un lugar inexistente, sin fila (S3)', async () => {
      const res = await request(app).post('/api/favoritos').set(auth).send({ lugarId: 999 });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('LUGAR_NO_ENCONTRADO');
      expect(await ctx.favoritoDAO.listarPorUsuario(usuarioId)).toEqual([]);
    });

    it.each([
      ['lugarId texto', { lugarId: 'a' }],
      ['lugarId 0', { lugarId: 0 }],
      ['lugarId negativo', { lugarId: -1 }],
      ['lugarId decimal', { lugarId: 1.5 }],
      ['lugarId fuera de INTEGER', { lugarId: 2_147_483_648 }],
      ['sin lugarId', {}],
      ['clave extra', { lugarId: 1, extra: true }],
    ])('400 VALIDACION_FALLIDA: %s (S4)', async (_caso, cuerpo) => {
      const res = await request(app).post('/api/favoritos').set(auth).send(cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
    });
  });

  describe('GET /api/favoritos', () => {
    it('sin favoritos: 200, lista vacia y el mensaje de HU 8.2 c3 (S10)', async () => {
      const res = await request(app).get('/api/favoritos').set(auth);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'No tienes lugares favoritos registrados.', data: { items: [] } });
    });

    it('omite un favorito cuyo lugar ya no existe en vez de fallar', async () => {
      await request(app).post('/api/favoritos').set(auth).send({ lugarId });
      await ctx.favoritoDAO.crear(usuarioId, 999_999);
      const res = await request(app).get('/api/favoritos').set(auth);
      expect(res.status).toBe(200);
      expect(res.body.data.items.map((f: { lugarId: number }) => f.lugarId)).toEqual([lugarId]);
    });

    it('lista los propios con el nivel efectivo, el mas nuevo primero, sin los de otros (S7, S8)', async () => {
      const viejo = ctx.lugarDAO.agregar({
        nombre: 'Plaza de Armas',
        categoria: 'PLAZA',
        saturacionActual: NivelSaturacion.SATURADO,
        saturacionActualizadaEn: haceMin(90),
      }).id;
      await request(app).post('/api/favoritos').set(auth).send({ lugarId });
      await request(app).post('/api/favoritos').set(auth).send({ lugarId: viejo });
      await request(app).post('/api/favoritos').set(nuevoUsuario().auth).send({ lugarId });
      const res = await request(app).get('/api/favoritos').set(auth);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Favoritos obtenidos correctamente.');
      expect(res.body.data.items).toEqual([
        { lugarId: viejo, nombre: 'Plaza de Armas', categoria: 'PLAZA', saturacion: 'SIN_INFORMACION', alertasActivadas: true },
        { lugarId, nombre: 'Parque Kennedy', categoria: 'PARQUE', saturacion: 'MODERADO', alertasActivadas: true },
      ]);
    });
  });

  describe('DELETE /api/favoritos/:lugarId', () => {
    it('204 sin cuerpo; la lista y el detalle dejan de mostrarlo (S9, S11)', async () => {
      await request(app).post('/api/favoritos').set(auth).send({ lugarId });
      const res = await request(app).delete(`/api/favoritos/${lugarId}`).set(auth);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect((await request(app).get('/api/favoritos').set(auth)).body.data.items).toEqual([]);
      expect((await request(app).get(`/api/lugares/${lugarId}`).set(auth)).body.data.esFavorito).toBe(false);
    });

    it('la segunda baja es 404 FAVORITO_NO_ENCONTRADO (S12)', async () => {
      await request(app).post('/api/favoritos').set(auth).send({ lugarId });
      await request(app).delete(`/api/favoritos/${lugarId}`).set(auth);
      const res = await request(app).delete(`/api/favoritos/${lugarId}`).set(auth);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('FAVORITO_NO_ENCONTRADO');
    });

    it('el favorito de otro usuario es 404 y sigue en pie (S13)', async () => {
      const otro = nuevoUsuario();
      await request(app).post('/api/favoritos').set(otro.auth).send({ lugarId });
      expect((await request(app).delete(`/api/favoritos/${lugarId}`).set(auth)).status).toBe(404);
      expect(await ctx.favoritoDAO.buscar(otro.id, lugarId)).not.toBeNull();
    });

    it.each(['abc', '0', '-3', '1.5', '2147483648'])('lugarId=%s en la ruta: 400', async (id) => {
      const res = await request(app).delete(`/api/favoritos/${id}`).set(auth);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
    });
  });

  describe('PATCH /api/favoritos/:lugarId/alertas', () => {
    it('200 con el favorito actualizado; apagar y volver a encender (S14)', async () => {
      await request(app).post('/api/favoritos').set(auth).send({ lugarId });
      const off = await request(app).patch(`/api/favoritos/${lugarId}/alertas`).set(auth).send({ alertasActivadas: false });
      expect(off.status).toBe(200);
      expect(off.body.data).toEqual({ lugarId, nombre: 'Parque Kennedy', categoria: 'PARQUE', saturacion: 'MODERADO', alertasActivadas: false });
      expect((await ctx.favoritoDAO.buscar(usuarioId, lugarId))?.alertasActivadas).toBe(false);
      const on = await request(app).patch(`/api/favoritos/${lugarId}/alertas`).set(auth).send({ alertasActivadas: true });
      expect(on.body.data.alertasActivadas).toBe(true);
    });

    it('es idempotente: repetir el mismo valor sigue en 200', async () => {
      await request(app).post('/api/favoritos').set(auth).send({ lugarId });
      for (let i = 0; i < 2; i += 1) {
        const res = await request(app).patch(`/api/favoritos/${lugarId}/alertas`).set(auth).send({ alertasActivadas: false });
        expect(res.status).toBe(200);
      }
    });

    it('un lugar que no es favorito es 404 FAVORITO_NO_ENCONTRADO', async () => {
      const res = await request(app).patch(`/api/favoritos/${lugarId}/alertas`).set(auth).send({ alertasActivadas: true });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('FAVORITO_NO_ENCONTRADO');
    });

    it.each([
      ['no booleano', { alertasActivadas: 'true' }],
      ['sin campo', {}],
      ['clave extra', { alertasActivadas: true, otra: 1 }],
    ])('400: %s', async (_caso, cuerpo) => {
      await request(app).post('/api/favoritos').set(auth).send({ lugarId });
      const res = await request(app).patch(`/api/favoritos/${lugarId}/alertas`).set(auth).send(cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
    });

    it('lugarId invalido en la ruta es 400', async () => {
      const res = await request(app).patch('/api/favoritos/abc/alertas').set(auth).send({ alertasActivadas: true });
      expect(res.status).toBe(400);
    });
  });
});
