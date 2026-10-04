/**
 * API tests of the M5 endpoints against the fake container (no database): votes, complaints, report detail,
 * reliability and the author's validation overview. Spec M5 R2-R6, S1-S4, S8-S13.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

const C = TipoAccionValidacion.CONFIRMAR;
const R = TipoAccionValidacion.RECHAZAR;

describe('API de validacion y denuncias (contenedor de prueba)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let lugarId: number;
  let autor: ReturnType<typeof nuevoUsuario>;
  let reporteId: number;

  const nuevoUsuario = (karma = 0) => {
    const usuario = ctx.usuarioDAO.agregar(aUsuario({ puntosKarma: karma }));
    return { usuario, cabecera: { Authorization: `Bearer ${ctx.emisorToken.emitir(usuario).token}` } };
  };
  const votoDe = (usuarioId: number, reporte: number, tipoAccion: TipoAccionValidacion) =>
    ctx.validacionDAO.crear({ reporteId: reporte, usuarioId, tipoAccion, karmaVotante: 0, puntosOtorgados: 2, fechaHora: new Date() });
  const votar = (cabecera: Record<string, string>, id: number | string, cuerpo: unknown) =>
    request(app).post(`/api/reportes/${id}/validaciones`).set(cabecera).send(cuerpo as object);
  const denunciar = (cabecera: Record<string, string>, id: number | string, cuerpo: unknown) =>
    request(app).post(`/api/reportes/${id}/denuncias`).set(cabecera).send(cuerpo as object);

  beforeEach(() => {
    ctx = crearContenedorPrueba();
    app = createApp(ctx.contenedor);
    lugarId = ctx.lugarDAO.agregar({ nombre: 'Parque Kennedy' }).id;
    autor = nuevoUsuario();
    reporteId = ctx.reporteDAO.agregar(aReporte({ usuarioId: autor.usuario.id, lugarId })).id;
  });

  describe('POST /api/reportes/:id/validaciones', () => {
    it('201 con karma, confiabilidad y estado, y persiste el voto (S1)', async () => {
      const { usuario, cabecera } = nuevoUsuario(10);
      const res = await votar(cabecera, reporteId, { tipoAccion: 'CONFIRMAR' });
      expect(res.status).toBe(201);
      expect(res.body.message).toContain('+2 karma');
      expect(res.body.data).toMatchObject({
        validacion: { reporteId, tipoAccion: 'CONFIRMAR' },
        karma: { puntosGanados: 2, total: 12 },
        confiabilidad: { porcentaje: null, nivel: 'INSUFICIENTE', confirmaciones: 1, rechazos: 0, advertencia: null },
        estadoValidacion: 'EN_VALIDACION',
      });
      expect(Date.parse(res.body.data.validacion.fechaHora)).not.toBeNaN();
      expect(await ctx.validacionDAO.buscarPorUsuarioYReporte(usuario.id, reporteId)).toMatchObject({ karmaVotante: 10 });
    });

    it('un voto repetido es 409 VALIDACION_DUPLICADA sin tocar el karma (S3)', async () => {
      const { usuario, cabecera } = nuevoUsuario();
      await votar(cabecera, reporteId, { tipoAccion: 'RECHAZAR' });
      const res = await votar(cabecera, reporteId, { tipoAccion: 'CONFIRMAR' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('VALIDACION_DUPLICADA');
      expect((await ctx.usuarioDAO.buscarPorId(usuario.id))?.puntosKarma).toBe(2);
    });

    it('votar el propio reporte es 422 AUTOVALIDACION_NO_PERMITIDA (S4)', async () => {
      const res = await votar(autor.cabecera, reporteId, { tipoAccion: 'CONFIRMAR' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('AUTOVALIDACION_NO_PERMITIDA');
    });

    it('un reporte inexistente o eliminado es 404 REPORTE_NO_ENCONTRADO', async () => {
      const { cabecera } = nuevoUsuario();
      const eliminado = ctx.reporteDAO.agregar(aReporte({ usuarioId: autor.usuario.id, lugarId, estado: EstadoReporte.ELIMINADO })).id;
      for (const id of [999_999, eliminado]) {
        const res = await votar(cabecera, id, { tipoAccion: 'CONFIRMAR' });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('REPORTE_NO_ENCONTRADO');
      }
    });

    it.each([
      ['tipoAccion invalido', 'x', { tipoAccion: 'TAL_VEZ' }, 'tipoAccion'],
      ['tipoAccion ausente', '1', {}, 'tipoAccion'],
      ['clave extra', '1', { tipoAccion: 'CONFIRMAR', comentario: 'hola' }, 'comentario'],
      ['id no numerico', 'abc', { tipoAccion: 'CONFIRMAR' }, 'id'],
      ['id cero', '0', { tipoAccion: 'CONFIRMAR' }, 'id'],
    ])('400 VALIDACION_FALLIDA si %s', async (_caso, id, cuerpo, campo) => {
      const { cabecera } = nuevoUsuario();
      const res = await votar(cabecera, id === 'x' ? reporteId : id, cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain(campo);
    });

    it('401 sin token', async () => {
      expect((await request(app).post(`/api/reportes/${reporteId}/validaciones`).send({ tipoAccion: 'CONFIRMAR' })).status).toBe(401);
    });
  });

  describe('POST /api/reportes/:id/denuncias', () => {
    it('201 PENDIENTE sin exponer al denunciante (S10)', async () => {
      const { usuario, cabecera } = nuevoUsuario();
      const res = await denunciar(cabecera, reporteId, { motivo: 'INFORMACION_FALSA' });
      expect(res.status).toBe(201);
      expect(res.body.message).toContain('Denuncia enviada');
      expect(res.body.data).toEqual({
        id: expect.any(Number),
        reporteId,
        motivo: 'INFORMACION_FALSA',
        detalle: null,
        estado: 'PENDIENTE',
        fechaHora: expect.any(String),
      });
      expect(await ctx.denunciaDAO.existe(usuario.id, reporteId)).toBe(true);
    });

    it('OTRO con detalle se guarda y sin detalle es 400 (S11)', async () => {
      const { cabecera } = nuevoUsuario();
      const sin = await denunciar(cabecera, reporteId, { motivo: 'OTRO' });
      expect(sin.status).toBe(400);
      expect(sin.body.errors.map((e: { campo: string }) => e.campo)).toContain('detalle');
      const con = await denunciar(cabecera, reporteId, { motivo: 'OTRO', detalle: 'Ya no esta alli' });
      expect(con.status).toBe(201);
      expect(con.body.data.detalle).toBe('Ya no esta alli');
    });

    it('detalle de mas de 280 caracteres y motivo desconocido son 400', async () => {
      const { cabecera } = nuevoUsuario();
      expect((await denunciar(cabecera, reporteId, { motivo: 'SPAM', detalle: 'x'.repeat(281) })).status).toBe(400);
      expect((await denunciar(cabecera, reporteId, { motivo: 'OTRA_COSA' })).status).toBe(400);
      expect((await denunciar(cabecera, reporteId, { motivo: 'SPAM', detalle: 'x'.repeat(280) })).status).toBe(201);
    });

    it('repetir es 409 DENUNCIA_DUPLICADA (S12)', async () => {
      const { cabecera } = nuevoUsuario();
      await denunciar(cabecera, reporteId, { motivo: 'SPAM' });
      const res = await denunciar(cabecera, reporteId, { motivo: 'SPAM' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DENUNCIA_DUPLICADA');
    });

    it('el propio reporte es 422 y uno inexistente es 404 (S13)', async () => {
      const propio = await denunciar(autor.cabecera, reporteId, { motivo: 'SPAM' });
      expect([propio.status, propio.body.code]).toEqual([422, 'AUTODENUNCIA_NO_PERMITIDA']);
      const { cabecera } = nuevoUsuario();
      const faltante = await denunciar(cabecera, 999_999, { motivo: 'SPAM' });
      expect([faltante.status, faltante.body.code]).toEqual([404, 'REPORTE_NO_ENCONTRADO']);
    });
  });

  describe('GET /api/reportes/:id y /confiabilidad', () => {
    it('detalle sin datos del autor, con mi voto y mi denuncia (S2)', async () => {
      const { usuario, cabecera } = nuevoUsuario();
      await votoDe(usuario.id, reporteId, R);
      await denunciar(cabecera, reporteId, { motivo: 'SPAM' });
      const res = await request(app).get(`/api/reportes/${reporteId}`).set(cabecera);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        id: reporteId,
        lugar: { id: lugarId, nombre: 'Parque Kennedy', categoria: expect.any(String) },
        nivel: expect.any(String),
        fechaHora: expect.any(String),
        confiabilidad: { porcentaje: null, nivel: 'INSUFICIENTE', confirmaciones: 0, rechazos: 1, advertencia: null },
        estadoValidacion: 'EN_VALIDACION',
        miValidacion: 'RECHAZAR',
        yaDenunciado: true,
        esPropio: false,
      });
    });

    it('el autor ve esPropio y la advertencia cuando la confiabilidad es BAJA', async () => {
      for (let i = 0; i < 5; i += 1) await votoDe(nuevoUsuario().usuario.id, reporteId, i === 0 ? C : R);
      const res = await request(app).get(`/api/reportes/${reporteId}`).set(autor.cabecera);
      expect(res.body.data).toMatchObject({ esPropio: true, miValidacion: null });
      expect(res.body.data.confiabilidad).toMatchObject({
        nivel: 'BAJA',
        porcentaje: 20,
        advertencia: 'Este reporte tiene pocas confirmaciones. Tómalo con precaución.',
      });
    });

    it('confiabilidad devuelve solo el bloque (S5)', async () => {
      const { cabecera } = nuevoUsuario();
      for (let i = 0; i < 21; i += 1) await votoDe(nuevoUsuario().usuario.id, reporteId, i < 18 ? C : R);
      const res = await request(app).get(`/api/reportes/${reporteId}/confiabilidad`).set(cabecera);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ porcentaje: 85.71, nivel: 'ALTA', confirmaciones: 18, rechazos: 3, advertencia: null });
    });

    it('404 REPORTE_NO_ENCONTRADO para ambos si no existe', async () => {
      const { cabecera } = nuevoUsuario();
      for (const ruta of ['/api/reportes/999999', '/api/reportes/999999/confiabilidad']) {
        const res = await request(app).get(ruta).set(cabecera);
        expect([res.status, res.body.code]).toEqual([404, 'REPORTE_NO_ENCONTRADO']);
      }
    });
  });

  describe('GET /api/reportes/mios/validacion', () => {
    it('lista mis reportes con conteos y estado sin confundirse con /reportes/:id (S8)', async () => {
      await votoDe(nuevoUsuario().usuario.id, reporteId, C);
      await votoDe(nuevoUsuario().usuario.id, reporteId, R);
      const res = await request(app).get('/api/reportes/mios/validacion').set(autor.cabecera);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ page: 1, size: 20, total: 1, totalPaginas: 1 });
      expect(res.body.data.items).toEqual([
        {
          reporteId,
          lugar: { id: lugarId, nombre: 'Parque Kennedy' },
          nivel: expect.any(String),
          fechaHora: expect.any(String),
          confiabilidad: { porcentaje: null, nivel: 'INSUFICIENTE', confirmaciones: 1, rechazos: 1, advertencia: null },
          estadoValidacion: 'EN_VALIDACION',
        },
      ]);
    });

    it('sin votos el estado es SIN_VALIDACIONES con el texto de la HU (S9)', async () => {
      const res = await request(app).get('/api/reportes/mios/validacion').set(autor.cabecera);
      expect(res.body.message).toBe('Todavía no existen validaciones registradas.');
      expect(res.body.data.items[0].estadoValidacion).toBe('SIN_VALIDACIONES');
    });

    it('sin reportes responde 200 con la pagina vacia', async () => {
      const res = await request(app).get('/api/reportes/mios/validacion').set(nuevoUsuario().cabecera);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ items: [], page: 1, size: 20, total: 0, totalPaginas: 0 });
    });

    it('page o size fuera de rango son 400', async () => {
      for (const consulta of ['page=0', 'size=51', 'size=0']) {
        expect((await request(app).get(`/api/reportes/mios/validacion?${consulta}`).set(autor.cabecera)).status).toBe(400);
      }
    });
  });

  it('GET /api/reportes/mios sigue siendo el listado de M4 (el orden de montaje se respeta)', async () => {
    const res = await request(app).get('/api/reportes/mios').set(autor.cabecera);
    expect(res.status).toBe(200);
    expect(res.body.data.items[0]).toHaveProperty('puntosOtorgados');
  });

  describe('limite por usuario (R1-1402, R3-1403)', () => {
    beforeEach(() => {
      ctx = crearContenedorPrueba({ cfg: { LIMITE_VALIDACIONES: 2, LIMITE_DENUNCIAS: 1 } });
      app = createApp(ctx.contenedor);
      lugarId = ctx.lugarDAO.agregar({ nombre: 'Parque Kennedy' }).id;
      autor = nuevoUsuario();
      reporteId = ctx.reporteDAO.agregar(aReporte({ usuarioId: autor.usuario.id, lugarId })).id;
    });
    const otroReporte = () => ctx.reporteDAO.agregar(aReporte({ usuarioId: autor.usuario.id, lugarId })).id;

    it('el tercer voto de la hora es 429 DEMASIADAS_SOLICITUDES con Retry-After; otro usuario no se ve afectado', async () => {
      const { cabecera } = nuevoUsuario();
      expect((await votar(cabecera, reporteId, { tipoAccion: 'CONFIRMAR' })).status).toBe(201);
      expect((await votar(cabecera, otroReporte(), { tipoAccion: 'CONFIRMAR' })).status).toBe(201);
      const res = await votar(cabecera, otroReporte(), { tipoAccion: 'CONFIRMAR' });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('DEMASIADAS_SOLICITUDES');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      const { cabecera: otra } = nuevoUsuario();
      expect((await votar(otra, reporteId, { tipoAccion: 'CONFIRMAR' })).status).toBe(201);
    });

    it('la segunda denuncia de la hora es 429, aunque sea de otro reporte', async () => {
      const { cabecera } = nuevoUsuario();
      expect((await denunciar(cabecera, reporteId, { motivo: 'SPAM' })).status).toBe(201);
      const res = await denunciar(cabecera, otroReporte(), { motivo: 'SPAM' });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('DEMASIADAS_SOLICITUDES');
    });
  });
});
