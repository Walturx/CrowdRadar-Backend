/**
 * API tests of the report endpoints against the fake container (no database): POST /api/reportes and
 * GET /api/reportes/mios, plus the karma shown by GET /api/users/profile. Spec M4 R1, R2, R3, R7, R8, S1-S6.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { ServicioNoDisponibleException } from '../../src/exception/http/ServicioNoDisponibleException.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aUsuario } from '../support/fabrica/datos.js';

describe('API de reportes (contenedor de prueba)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let lugarId: number;

  const nuevoUsuario = (estado: EstadoCuenta = EstadoCuenta.ACTIVO) => {
    const usuario = ctx.usuarioDAO.agregar(aUsuario({ status: estado }));
    return { usuario, cabecera: { Authorization: `Bearer ${ctx.emisorToken.emitir(usuario).token}` } };
  };
  const reportar = (cabecera: Record<string, string>, cuerpo: unknown) =>
    request(app).post('/api/reportes').set(cabecera).send(cuerpo as object);

  beforeEach(() => {
    ctx = crearContenedorPrueba();
    app = createApp(ctx.contenedor);
    lugarId = ctx.lugarDAO.agregar({ nombre: 'Parque Kennedy' }).id;
  });

  describe('POST /api/reportes', () => {
    it('201 {message, data:{reporte, karma, saturacionLugar}} y persiste el reporte (S1)', async () => {
      const { usuario, cabecera } = nuevoUsuario();
      const res = await reportar(cabecera, { lugarId, nivel: 'MODERADO' });
      expect(res.status).toBe(201);
      expect(res.body.message).toEqual(expect.any(String));
      expect(res.body.data).toMatchObject({
        reporte: { lugarId, nivel: 'MODERADO' },
        karma: { puntosGanados: 10, total: 10, motivoSinPuntos: null },
      });
      expect(res.body.data.reporte.id).toEqual(expect.any(Number));
      expect(Date.parse(res.body.data.reporte.fechaHora)).not.toBeNaN();
      expect(res.body.data.saturacionLugar).toEqual({ nivel: null, actualizadoEn: expect.any(String) });
      expect(await ctx.reporteDAO.buscarPorId(res.body.data.reporte.id)).toMatchObject({ usuarioId: usuario.id, lugarId });
    });

    it('el karma total acumula entre reportes de lugares distintos', async () => {
      const { cabecera } = nuevoUsuario();
      const otro = ctx.lugarDAO.agregar({ nombre: 'Larcomar' }).id;
      await reportar(cabecera, { lugarId, nivel: 'TRANQUILO' });
      const res = await reportar(cabecera, { lugarId: otro, nivel: 'SATURADO' });
      expect(res.status).toBe(201);
      expect(res.body.data.karma).toMatchObject({ puntosGanados: 10, total: 20 });
    });

    it.each([
      ['nivel invalido', { lugarId: 1, nivel: 'X' }, 'nivel'],
      ['nivel ausente', { lugarId: 1 }, 'nivel'],
      ['lugarId no numerico', { lugarId: 'a', nivel: 'MODERADO' }, 'lugarId'],
      ['lugarId cero', { lugarId: 0, nivel: 'MODERADO' }, 'lugarId'],
      ['lugarId decimal', { lugarId: 1.5, nivel: 'MODERADO' }, 'lugarId'],
      ['clave extra', { lugarId: 1, nivel: 'MODERADO', comentario: 'hola' }, 'comentario'],
    ])('400 VALIDACION_FALLIDA con errors[campo] si %s (S2)', async (_caso, cuerpo, campo) => {
      const { cabecera } = nuevoUsuario();
      const res = await reportar(cabecera, cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain(campo);
    });

    it('404 LUGAR_NO_ENCONTRADO y no escribe nada (S3)', async () => {
      const { usuario, cabecera } = nuevoUsuario();
      const res = await reportar(cabecera, { lugarId: 999_999, nivel: 'MODERADO' });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('LUGAR_NO_ENCONTRADO');
      expect((await ctx.reporteDAO.listarPorUsuario(usuario.id, { page: 1, size: 10 })).total).toBe(0);
    });

    it('401 NO_AUTENTICADO sin token', async () => {
      const res = await request(app).post('/api/reportes').send({ lugarId, nivel: 'MODERADO' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    it('403 CUENTA_SUSPENDIDA con la cuenta suspendida', async () => {
      const { cabecera } = nuevoUsuario(EstadoCuenta.SUSPENDIDO);
      const res = await reportar(cabecera, { lugarId, nivel: 'MODERADO' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CUENTA_SUSPENDIDA');
    });

    it('422 REPORTE_EN_ESPERA con los minutos restantes, sin fila ni karma extra (S4)', async () => {
      const { usuario, cabecera } = nuevoUsuario();
      await reportar(cabecera, { lugarId, nivel: 'MODERADO' });
      const res = await reportar(cabecera, { lugarId, nivel: 'SATURADO' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('REPORTE_EN_ESPERA');
      expect(res.body.message).toBe('Ya reportaste este lugar. Vuelve a intentarlo en 30 minutos.');
      expect((await ctx.reporteDAO.listarPorUsuario(usuario.id, { page: 1, size: 10 })).total).toBe(1);
      expect((await ctx.usuarioDAO.buscarPorId(usuario.id))?.puntosKarma).toBe(10);
    });

    it('otro usuario en el mismo lugar no esta en espera (S5)', async () => {
      await reportar(nuevoUsuario().cabecera, { lugarId, nivel: 'MODERADO' });
      const res = await reportar(nuevoUsuario().cabecera, { lugarId, nivel: 'MODERADO' });
      expect(res.status).toBe(201);
    });

    it('dos peticiones simultaneas del mismo usuario y lugar: un 201 y un 422, una sola fila (S6)', async () => {
      const { usuario, cabecera } = nuevoUsuario();
      const respuestas = await Promise.all([
        reportar(cabecera, { lugarId, nivel: 'MODERADO' }),
        reportar(cabecera, { lugarId, nivel: 'MODERADO' }),
      ]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 422]);
      expect((await ctx.reporteDAO.listarPorUsuario(usuario.id, { page: 1, size: 10 })).total).toBe(1);
    });

    it('503 SERVICIO_NO_DISPONIBLE cuando la base de datos no responde', async () => {
      const { cabecera } = nuevoUsuario();
      vi.spyOn(ctx.reporteDAO, 'crear').mockRejectedValueOnce(new ServicioNoDisponibleException());
      const res = await reportar(cabecera, { lugarId, nivel: 'MODERADO' });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('SERVICIO_NO_DISPONIBLE');
    });
  });

  describe('GET /api/reportes/mios', () => {
    const mios = (cabecera: Record<string, string>, consulta = '') => request(app).get(`/api/reportes/mios${consulta}`).set(cabecera);

    it('lista solo los propios, el mas nuevo primero, con lugar{id,nombre} (R7)', async () => {
      const { cabecera } = nuevoUsuario();
      const larcomar = ctx.lugarDAO.agregar({ nombre: 'Larcomar' }).id;
      await reportar(cabecera, { lugarId, nivel: 'TRANQUILO' });
      await new Promise((resolver) => setTimeout(resolver, 5));
      await reportar(cabecera, { lugarId: larcomar, nivel: 'SATURADO' });
      await reportar(nuevoUsuario().cabecera, { lugarId, nivel: 'MODERADO' });

      const res = await mios(cabecera);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ page: 1, size: 20, total: 2, totalPaginas: 1 });
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0]).toEqual({
        id: expect.any(Number),
        lugar: { id: larcomar, nombre: 'Larcomar' },
        nivel: 'SATURADO',
        fechaHora: expect.any(String),
        estado: 'ACTIVO',
        puntosOtorgados: 10,
        motivoSinPuntos: null,
      });
      expect(res.body.data.items[1].lugar).toEqual({ id: lugarId, nombre: 'Parque Kennedy' });
    });

    it('pagina con page y size', async () => {
      const { cabecera } = nuevoUsuario();
      for (let i = 0; i < 3; i += 1) {
        const id = ctx.lugarDAO.agregar({ nombre: `Lugar ${i}` }).id;
        await reportar(cabecera, { lugarId: id, nivel: 'MODERADO' });
      }
      const res = await mios(cabecera, '?page=2&size=2');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ page: 2, size: 2, total: 3, totalPaginas: 2 });
      expect(res.body.data.items).toHaveLength(1);
    });

    it('sin reportes: 200, items [] y mensaje "Aún no tienes reportes"', async () => {
      const res = await mios(nuevoUsuario().cabecera);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Aún no tienes reportes');
      expect(res.body.data).toMatchObject({ items: [], total: 0 });
    });

    it.each(['?size=51', '?size=0', '?page=0', '?page=x', '?size=1.5'])('400 con %s', async (consulta) => {
      const res = await mios(nuevoUsuario().cabecera, consulta);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
    });

    it('size 50 es el maximo permitido', async () => {
      expect((await mios(nuevoUsuario().cabecera, '?size=50')).status).toBe(200);
    });

    it('401 sin token', async () => {
      expect((await request(app).get('/api/reportes/mios')).status).toBe(401);
    });

    it('/reportes/mios/validacion es del flujo M5 y no lo captura /reportes/:id', async () => {
      const res = await request(app).get('/api/reportes/mios/validacion').set(nuevoUsuario().cabecera);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/users/profile despues de reportar (R8)', () => {
    it('muestra el karma acumulado', async () => {
      const { cabecera } = nuevoUsuario();
      const antes = await request(app).get('/api/users/profile').set(cabecera);
      expect(antes.body.data.user.puntosKarma).toBe(0);
      await reportar(cabecera, { lugarId, nivel: 'MODERADO' });
      const despues = await request(app).get('/api/users/profile').set(cabecera);
      expect(despues.body.data.user.puntosKarma).toBe(10);
    });
  });
});
