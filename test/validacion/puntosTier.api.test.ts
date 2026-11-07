/**
 * Points and tier over HTTP (CRO-72, wire contract C1, C4, C5, C7): profile, login, register, the admin directory,
 * GET /api/reportes/mios and the voter's block of the vote response, against the in-memory container. The points are never stored: every test seeds reports and
 * votes and reads them back through the API.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { Rol } from '../../src/enum/Rol.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aLugar, aReporte, aUsuario } from '../support/fabrica/datos.js';

const C = TipoAccionValidacion.CONFIRMAR;
const R = TipoAccionValidacion.RECHAZAR;
const PASSWORD = 'Secreta123';

describe('puntos y tier por la API', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let lugarId: number;
  /** Ten users that only vote, so any report they all confirm is VALIDADO (10 votes, 100 %). */
  let jurado: number[];

  const conToken = (usuario: Parameters<ContenedorPrueba['emisorToken']['emitir']>[0]) => ({
    Authorization: `Bearer ${ctx.emisorToken.emitir(usuario).token}`,
  });
  const votar = (usuarioId: number, reporteId: number, tipoAccion: TipoAccionValidacion) =>
    ctx.validacionDAO.crear({ reporteId, usuarioId, tipoAccion, fechaHora: new Date() });
  const reporteDe = (usuarioId: number) => ctx.reporteDAO.agregar(aReporte({ usuarioId, lugarId })).id;
  /** A report of `autor` voted by the first `confirman` jurors with CONFIRMAR and the next `rechazan` with RECHAZAR. */
  const reporteVotado = async (autor: number, confirman: number, rechazan = 0) => {
    const reporteId = reporteDe(autor);
    for (const [i, u] of jurado.slice(0, confirman + rechazan).entries()) await votar(u, reporteId, i < confirman ? C : R);
    return reporteId;
  };

  beforeEach(() => {
    ctx = crearContenedorPrueba();
    app = createApp(ctx.contenedor);
    lugarId = ctx.lugarDAO.agregar(aLugar({ nombre: 'Parque Kennedy' })).id;
    jurado = Array.from({ length: 11 }, () => ctx.usuarioDAO.agregar(aUsuario()).id);
  });

  describe('perfil, login y registro', () => {
    let ana: { id: number; token: string };

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ nombre: 'Ana', apellido: 'Perez', email: 'ana@crowdradar.pe', password: PASSWORD, distrito: 'Miraflores' });
      ana = { id: res.body.data.user.id, token: res.body.data.token };
    });

    it('10 reportes propios VALIDADOS y 10 votos que coinciden dan 120 puntos y Crowd Explorer en el perfil', async () => {
      for (let i = 0; i < 10; i += 1) await reporteVotado(ana.id, 10);
      for (let i = 0; i < 10; i += 1) {
        // nine jurors confirm and Ana's vote is the tenth: VALIDADO, and her CONFIRMAR matches it
        const ajeno = await reporteVotado(jurado[10]!, 9);
        await votar(ana.id, ajeno, C);
      }
      const res = await request(app).get('/api/users/profile').set({ Authorization: `Bearer ${ana.token}` });
      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({ puntos: 120, tier: 'CROWD_EXPLORER' });
      expect(res.body.data.user).not.toHaveProperty('puntosKarma');
    });

    it('el registro devuelve puntos 0 y Crowd Baby en lugar de puntosKarma, con los demas campos igual', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ nombre: 'Luis', apellido: 'Rojas', email: 'luis@crowdradar.pe', password: PASSWORD, telefono: '987654321', distrito: 'Lince' });
      expect(res.status).toBe(201);
      expect(res.body.data.user).toEqual({
        id: expect.any(Number),
        nombre: 'Luis',
        apellido: 'Rojas',
        email: 'luis@crowdradar.pe',
        telefono: '987654321',
        distrito: 'Lince',
        rol: 'USUARIO',
        status: 'ACTIVO',
        puntos: 0,
        tier: 'CROWD_BABY',
      });
    });

    it('el login devuelve los puntos y el tier calculados, con los demas campos igual', async () => {
      for (let i = 0; i < 5; i += 1) await reporteVotado(ana.id, 10);
      const res = await request(app).post('/api/auth/login').send({ email: 'ana@crowdradar.pe', password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.user).toEqual({
        id: ana.id,
        nombre: 'Ana',
        apellido: 'Perez',
        email: 'ana@crowdradar.pe',
        telefono: null,
        distrito: 'Miraflores',
        rol: 'USUARIO',
        status: 'ACTIVO',
        puntos: 50,
        tier: 'CROWD_EXPLORER',
      });
    });

    it('PUT /api/users/profile tambien devuelve puntos y tier', async () => {
      await reporteVotado(ana.id, 10);
      const res = await request(app).put('/api/users/profile').set({ Authorization: `Bearer ${ana.token}` }).send({ distrito: 'Barranco' });
      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({ distrito: 'Barranco', puntos: 10, tier: 'CROWD_BABY' });
      expect(res.body.data.user).not.toHaveProperty('puntosKarma');
    });

    it('un reporte EN_VALIDACION o ELIMINADO no suma puntos ni a su autor ni a sus votantes', async () => {
      const enValidacion = await reporteVotado(ana.id, 9);
      const eliminado = await reporteVotado(ana.id, 10);
      await ctx.reporteDAO.actualizarEstado(eliminado, EstadoReporte.ELIMINADO);
      expect(enValidacion).toBeGreaterThan(0);
      const perfil = async (u: { id: number }) =>
        (await request(app).get('/api/users/profile').set(conToken((await ctx.usuarioDAO.buscarPorId(u.id))!))).body.data.user;
      expect(await perfil(ana)).toMatchObject({ puntos: 0, tier: 'CROWD_BABY' });
      expect(await perfil({ id: jurado[0]! })).toMatchObject({ puntos: 0 });
    });

    it('un voto que no coincide con el estado del reporte no suma; uno que coincide suma 2', async () => {
      const validado = await reporteVotado(jurado[10]!, 9);
      await votar(ana.id, validado, R); // 9 of 10 confirm: VALIDADO, Ana's RECHAZAR does not match
      const rechazado = await reporteVotado(jurado[10]!, 0, 9);
      await votar(ana.id, rechazado, R); // RECHAZADO, Ana's RECHAZAR matches
      const res = await request(app).get('/api/users/profile').set({ Authorization: `Bearer ${ana.token}` });
      expect(res.body.data.user).toMatchObject({ puntos: 2, tier: 'CROWD_BABY' });
    });

    it('si un reporte deja de estar VALIDADO el puntaje de su autor baja 10', async () => {
      const reporteId = await reporteVotado(ana.id, 7, 3); // 70 %: VALIDADO
      await reporteVotado(ana.id, 10);
      const leer = async () => (await request(app).get('/api/users/profile').set({ Authorization: `Bearer ${ana.token}` })).body.data.user.puntos;
      expect(await leer()).toBe(20);
      await votar(ctx.usuarioDAO.agregar(aUsuario()).id, reporteId, R); // 7 of 11: 63.64 %
      expect(await leer()).toBe(10);
    });
  });

  describe('directorio de admin', () => {
    let cabeceraAdmin: Record<string, string>;
    let lucia: number;

    beforeEach(async () => {
      cabeceraAdmin = conToken(ctx.usuarioDAO.agregar(aUsuario({ rol: Rol.ADMIN, nombre: 'Admin' })));
      lucia = ctx.usuarioDAO.agregar(aUsuario({ nombre: 'Lucia', apellido: 'Ramos', email: 'lucia@crowdradar.pe' })).id;
      for (let i = 0; i < 15; i += 1) await reporteVotado(lucia, 10);
    });

    it('cada usuario de la lista trae puntos y tier en lugar de puntosKarma', async () => {
      const res = await request(app).get('/api/admin/usuarios?q=lucia').set(cabeceraAdmin);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([
        {
          id: lucia,
          nombre: 'Lucia',
          apellido: 'Ramos',
          email: 'lucia@crowdradar.pe',
          rol: 'USUARIO',
          status: 'ACTIVO',
          puntos: 150,
          tier: 'CROWD_COLLABORATOR',
          sancionVigente: null,
        },
      ]);
    });

    it('calcula los puntos de toda la pagina con una sola lectura (sin N+1)', async () => {
      const espia = vi.spyOn(ctx.puntajeDAO, 'contarAportes');
      const res = await request(app).get('/api/admin/usuarios?size=50').set(cabeceraAdmin);
      expect(res.body.data.items.length).toBeGreaterThan(10);
      expect(espia).toHaveBeenCalledTimes(1);
    });

    it('el detalle de un usuario trae puntos y tier', async () => {
      const res = await request(app).get(`/api/admin/usuarios/${lucia}`).set(cabeceraAdmin);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: lucia, puntos: 150, tier: 'CROWD_COLLABORATOR', reportesPublicados: 15 });
      expect(res.body.data).not.toHaveProperty('puntosKarma');
    });

    it('orden=KARMA ya no existe: 400 VALIDACION_FALLIDA como cualquier orden desconocido', async () => {
      const res = await request(app).get('/api/admin/usuarios?orden=KARMA').set(cabeceraAdmin);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
    });

    it('eliminar un reporte VALIDADO por moderacion le quita sus 10 puntos al autor, sin paso de revocacion', async () => {
      const autor = ctx.usuarioDAO.agregar(aUsuario({ nombre: 'Rosa' }));
      const reporteId = await reporteVotado(autor.id, 10);
      await reporteVotado(autor.id, 10);
      const leer = async () => (await request(app).get('/api/users/profile').set(conToken(autor))).body.data.user;
      expect(await leer()).toMatchObject({ puntos: 20 });
      await ctx.denunciaDAO.crear({ reporteId, usuarioId: jurado[0]!, motivo: 'INFORMACION_FALSA', detalle: null, fechaHora: new Date() });
      const res = await request(app)
        .post(`/api/admin/reportes-denunciados/${reporteId}/resolucion`)
        .set(cabeceraAdmin)
        .send({ decision: 'ELIMINAR' });
      expect(res.status).toBe(200);
      expect(await leer()).toMatchObject({ puntos: 10, tier: 'CROWD_BABY' });
    });

    it('orden=RECIENTES y orden=NOMBRE siguen funcionando', async () => {
      const recientes = await request(app).get('/api/admin/usuarios?orden=RECIENTES&q=lucia').set(cabeceraAdmin);
      const nombre = await request(app).get('/api/admin/usuarios?orden=NOMBRE&q=lucia').set(cabeceraAdmin);
      expect([recientes.status, nombre.status]).toEqual([200, 200]);
      expect(recientes.body.data.items.map((i: { id: number }) => i.id)).toEqual([lucia]);
      expect(nombre.body.data.items.map((i: { id: number }) => i.id)).toEqual([lucia]);
    });
  });

  describe('POST /api/reportes/:id/validaciones trae los puntos y el tier del votante (C7)', () => {
    let votante: ReturnType<ContenedorPrueba['usuarioDAO']['agregar']>;

    const votarPorApi = (reporteId: number, tipoAccion: TipoAccionValidacion = C) =>
      request(app).post(`/api/reportes/${reporteId}/validaciones`).set(conToken(votante)).send({ tipoAccion });
    const perfil = async () => (await request(app).get('/api/users/profile').set(conToken(votante))).body.data.user;
    /** The vote's `usuario` block must be exactly what the profile says right after it. */
    const esperarIgualAlPerfil = async (usuario: unknown) => {
      const { puntos, tier } = await perfil();
      expect(usuario).toEqual({ puntos, tier });
    };

    beforeEach(() => {
      votante = ctx.usuarioDAO.agregar(aUsuario());
    });

    it('el decimo voto CONFIRMAR deja el reporte VALIDADO y ya trae sus +2: el votante pasa de 0 a 2', async () => {
      const reporteId = await reporteVotado(jurado[10]!, 9);
      expect(await perfil()).toMatchObject({ puntos: 0, tier: 'CROWD_BABY' });
      const res = await votarPorApi(reporteId);
      expect(res.status).toBe(201);
      expect(res.body.data.estadoValidacion).toBe('VALIDADO');
      expect(res.body.data.usuario).toEqual({ puntos: 2, tier: 'CROWD_BABY' });
      await esperarIgualAlPerfil(res.body.data.usuario);
    });

    it('un voto que todavia no decide el reporte trae los puntos que el votante ya tenia, iguales a su perfil', async () => {
      for (let i = 0; i < 5; i += 1) await reporteVotado(votante.id, 10);
      const res = await votarPorApi(reporteDe(jurado[10]!));
      expect(res.status).toBe(201);
      expect(res.body.data.estadoValidacion).toBe('EN_VALIDACION');
      expect(res.body.data.usuario).toEqual({ puntos: 50, tier: 'CROWD_EXPLORER' });
      await esperarIgualAlPerfil(res.body.data.usuario);
    });

    it('el voto que cruza un umbral trae el tier nuevo: 48 puntos pasan a 50 y Crowd Explorer', async () => {
      for (let i = 0; i < 4; i += 1) await reporteVotado(votante.id, 10);
      for (let i = 0; i < 4; i += 1) await votar(votante.id, await reporteVotado(jurado[10]!, 9), C);
      expect(await perfil()).toMatchObject({ puntos: 48, tier: 'CROWD_BABY' });
      const res = await votarPorApi(await reporteVotado(jurado[10]!, 9));
      expect(res.body.data.usuario).toEqual({ puntos: 50, tier: 'CROWD_EXPLORER' });
      await esperarIgualAlPerfil(res.body.data.usuario);
    });

    it('un voto que no coincide con el estado que deja no suma: RECHAZAR como decimo voto de un reporte VALIDADO', async () => {
      const res = await votarPorApi(await reporteVotado(jurado[10]!, 9), R);
      expect(res.body.data.estadoValidacion).toBe('VALIDADO'); // 9 of 10 confirm
      expect(res.body.data.usuario).toEqual({ puntos: 0, tier: 'CROWD_BABY' });
      await esperarIgualAlPerfil(res.body.data.usuario);
    });
  });

  describe('GET /api/reportes/mios', () => {
    it('cada reporte trae sus puntos: 10 si esta VALIDADO y 0 si no, sin puntosOtorgados ni motivoSinPuntos', async () => {
      const autor = ctx.usuarioDAO.agregar(aUsuario());
      const validado = await reporteVotado(autor.id, 10);
      const enValidacion = await reporteVotado(autor.id, 9);
      const eliminado = await reporteVotado(autor.id, 10);
      await ctx.reporteDAO.actualizarEstado(eliminado, EstadoReporte.ELIMINADO);
      const res = await request(app).get('/api/reportes/mios').set(conToken(autor));
      expect(res.status).toBe(200);
      const porId = new Map(res.body.data.items.map((i: { id: number }) => [i.id, i]));
      expect(porId.get(validado)).toEqual({
        id: validado,
        lugar: { id: lugarId, nombre: 'Parque Kennedy' },
        nivel: 'MODERADO',
        fechaHora: expect.any(String),
        estado: 'ACTIVO',
        puntos: 10,
      });
      expect(porId.get(enValidacion)).toMatchObject({ estado: 'ACTIVO', puntos: 0 });
      expect(porId.get(eliminado)).toMatchObject({ estado: 'ELIMINADO', puntos: 0 });
    });
  });
});
