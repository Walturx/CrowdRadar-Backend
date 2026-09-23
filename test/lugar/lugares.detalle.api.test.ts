/** GET /api/lugares/:id through HTTP: 200 detail, 404 LUGAR_NO_ENCONTRADO, 400 invalid id, 401. */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { crearContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

const ctx = crearContenedorPrueba();
const app = createApp(ctx.contenedor);
const usuario = ctx.usuarioDAO.agregar(aUsuario({ email: 'detalle@crowdradar.pe' }));
const TOKEN = `Bearer ${ctx.emisorToken.emitir(usuario).token}`;
const detalle = (id: number | string) => request(app).get(`/api/lugares/${id}`).set('Authorization', TOKEN);
const haceMin = (min: number) => new Date(Date.now() - min * 60_000);

describe('GET /api/lugares/:id', () => {
  it('200 con el detalle: nombre, direccion, categoria y saturacion vigente con sus reportes', async () => {
    const lugar = ctx.lugarDAO.agregar({
      nombre: 'Parque Kennedy',
      direccion: 'Miraflores, Lima',
      saturacionActual: NivelSaturacion.MODERADO,
      saturacionActualizadaEn: haceMin(5),
      horaApertura: 0,
      horaCierre: 24,
      horarioAtencion: 'Todo el dia',
    });
    ctx.reporteDAO.agregar(aReporte({ lugarId: lugar.id, fechaHora: haceMin(10), estado: EstadoReporte.ACTIVO }));
    ctx.reporteDAO.agregar(aReporte({ lugarId: lugar.id, fechaHora: haceMin(20), estado: EstadoReporte.ACTIVO }));
    ctx.reporteDAO.agregar(aReporte({ lugarId: lugar.id, fechaHora: haceMin(300), estado: EstadoReporte.ACTIVO }));

    const res = await detalle(lugar.id);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Lugar obtenido correctamente.');
    expect(res.body.data).toMatchObject({
      id: lugar.id,
      nombre: 'Parque Kennedy',
      direccion: 'Miraflores, Lima',
      categoria: 'PARQUE',
      latitud: -12.12,
      longitud: -77.03,
      horarioAtencion: 'Todo el dia',
      abiertoAhora: true,
      urlFoto: null,
      esFavorito: false,
      alertasActivadas: false,
    });
    expect(res.body.data.saturacion).toEqual({
      nivel: 'MODERADO',
      actualizadoEn: expect.any(String),
      reportesRecientes: 2,
      mensaje: null,
    });
    expect(Date.now() - Date.parse(res.body.data.saturacion.actualizadoEn)).toBeLessThan(6 * 60_000);
  });

  it('saturacion vencida o ausente: SIN_INFORMACION con el mensaje y sin fecha', async () => {
    const vencido = ctx.lugarDAO.agregar({ saturacionActual: NivelSaturacion.SATURADO, saturacionActualizadaEn: haceMin(90) });
    const nunca = ctx.lugarDAO.agregar({ saturacionActual: null });
    for (const lugar of [vencido, nunca]) {
      const res = await detalle(lugar.id);
      expect(res.body.data.saturacion).toEqual({
        nivel: 'SIN_INFORMACION',
        actualizadoEn: null,
        reportesRecientes: 0,
        mensaje: 'Aún no hay reportes suficientes para determinar la saturación de este lugar.',
      });
    }
  });

  it('favorito del usuario con alertas, y abiertoAhora null cuando no hay horas', async () => {
    const lugar = ctx.lugarDAO.agregar({ horaApertura: null, horaCierre: null });
    await ctx.favoritoDAO.crear(usuario.id, lugar.id);
    const res = await detalle(lugar.id);
    expect(res.body.data).toMatchObject({ esFavorito: true, alertasActivadas: true, abiertoAhora: null });
    await ctx.favoritoDAO.actualizarAlertas(usuario.id, lugar.id, false);
    expect((await detalle(lugar.id)).body.data).toMatchObject({ esFavorito: true, alertasActivadas: false });
  });

  it('id inexistente: 404 LUGAR_NO_ENCONTRADO', async () => {
    const res = await detalle(987654);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'LUGAR_NO_ENCONTRADO', message: 'No se pudo obtener la información del lugar.' });
  });

  it.each(['abc', '0', '-1', '1.5', '12abc', '99999999999'])('id=%s -> 400 VALIDACION_FALLIDA con campo id', async (id) => {
    const res = await detalle(id);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDACION_FALLIDA');
    expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain('id');
  });

  it('sin token -> 401 NO_AUTENTICADO', async () => {
    const res = await request(app).get('/api/lugares/1');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_AUTENTICADO');
  });

  it('/lugares/explorar y /lugares/categorias no caen en el detalle de un id (M3 las entrego)', async () => {
    for (const ruta of ['explorar', 'categorias']) {
      const res = await request(app).get(`/api/lugares/${ruta}`).set('Authorization', TOKEN);
      expect(res.status).toBe(200);
    }
  });
});
