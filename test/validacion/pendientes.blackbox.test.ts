/**
 * Black-box tests (equivalence partitions + boundary values) of GET /api/validaciones/pendientes, whose six inputs are
 * lat, lng, radioKm, horas, page and size. Spec M5 R1, S14. The clock is pinned so the time window is exact.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { TipoAccionValidacion } from '../../src/enum/TipoAccionValidacion.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-05T15:00:00Z');
const CENTRO = { lat: -12.1, lng: -77.03 };
const haceMinutos = (n: number) => new Date(AHORA.getTime() - n * 60_000);
const ruta = (consulta: string) => `/api/validaciones/pendientes?${consulta}`;
const BASE = `lat=${CENTRO.lat}&lng=${CENTRO.lng}`;

describe('GET /api/validaciones/pendientes (caja negra)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let cabecera: Record<string, string>;
  let miId: number;
  let autorId: number;

  const lugarA = (km: number, nombre = `Lugar a ${km} km`) =>
    ctx.lugarDAO.agregar({ nombre, latitud: CENTRO.lat + km * 0.009, longitud: CENTRO.lng });
  const reporteEn = (lugarId: number, minutos = 10, usuarioId = autorId) =>
    ctx.reporteDAO.agregar(aReporte({ usuarioId, lugarId, fechaHora: haceMinutos(minutos) })).id;
  const pedir = (consulta: string) => request(app).get(ruta(consulta)).set(cabecera);
  const ids = (res: request.Response) => res.body.data.items.map((i: { id: number }) => i.id);

  beforeEach(() => {
    ctx = crearContenedorPrueba({ reloj: new RelojFijo(AHORA) });
    app = createApp(ctx.contenedor);
    const yo = ctx.usuarioDAO.agregar(aUsuario());
    miId = yo.id;
    autorId = ctx.usuarioDAO.agregar(aUsuario()).id;
    cabecera = { Authorization: `Bearer ${ctx.emisorToken.emitir(yo).token}` };
  });

  it('200 con los campos del contrato en cada item', async () => {
    const lugar = lugarA(1, 'Parque de la Reserva');
    const reporte = reporteEn(lugar.id);
    const res = await pedir(BASE);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ page: 1, size: 20, total: 1, totalPaginas: 1 });
    expect(res.body.data.items).toEqual([
      {
        id: reporte,
        lugar: { id: lugar.id, nombre: 'Parque de la Reserva', categoria: lugar.categoria },
        nivel: 'MODERADO',
        fechaHora: haceMinutos(10).toISOString(),
        distanciaMetros: expect.any(Number),
        confiabilidad: { porcentaje: null, nivel: 'INSUFICIENTE', confirmaciones: 0, rechazos: 0, advertencia: null },
      },
    ]);
    expect(res.body.data.items[0].distanciaMetros).toBeGreaterThan(900);
    expect(res.body.data.items[0].distanciaMetros).toBeLessThan(1100);
  });

  it('sin resultados es 200 con items vacios', async () => {
    const res = await pedir(BASE);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ items: [], page: 1, size: 20, total: 0, totalPaginas: 0 });
  });

  it('401 sin token', async () => {
    expect((await request(app).get(ruta(BASE))).status).toBe(401);
  });

  it('ordena por distancia y luego por fecha y excluye propios, votados, eliminados', async () => {
    const cerca = lugarA(1);
    const lejos = lugarA(3);
    const lejosNuevo = reporteEn(lejos.id, 5);
    const lejosViejo = reporteEn(lejos.id, 50);
    const cercaViejo = reporteEn(cerca.id, 90);
    reporteEn(cerca.id, 10, miId); // own
    const votado = reporteEn(cerca.id, 20);
    await ctx.validacionDAO.crear({
      reporteId: votado,
      usuarioId: miId,
      tipoAccion: TipoAccionValidacion.CONFIRMAR,
      karmaVotante: 0,
      puntosOtorgados: 2,
      fechaHora: AHORA,
    });
    expect(ids(await pedir(BASE))).toEqual([cercaViejo, lejosNuevo, lejosViejo]);
  });

  describe('lat y lng (obligatorios, -90..90 y -180..180)', () => {
    it.each([
      ['lat ausente', `lng=${CENTRO.lng}`, 'lat'],
      ['lng ausente', `lat=${CENTRO.lat}`, 'lng'],
      ['lat no numerica', `lat=abc&lng=${CENTRO.lng}`, 'lat'],
      ['lat 90.01', `lat=90.01&lng=${CENTRO.lng}`, 'lat'],
      ['lat -90.01', `lat=-90.01&lng=${CENTRO.lng}`, 'lat'],
      ['lng 180.01', `lat=${CENTRO.lat}&lng=180.01`, 'lng'],
      ['lng -180.01', `lat=${CENTRO.lat}&lng=-180.01`, 'lng'],
    ])('400 VALIDACION_FALLIDA con %s', async (_caso, consulta, campo) => {
      const res = await pedir(consulta);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain(campo);
    });

    it.each([
      ['lat 90', 'lat=90&lng=0'],
      ['lat -90', 'lat=-90&lng=0'],
      ['lng 180', 'lat=0&lng=180'],
      ['lng -180', 'lat=0&lng=-180'],
    ])('200 en el borde valido: %s', async (_caso, consulta) => {
      expect((await pedir(consulta)).status).toBe(200);
    });
  });

  describe('radioKm (0.1..20, 5 por defecto)', () => {
    it.each([['0.09'], ['0'], ['-1'], ['20.01'], ['abc']])('400 con radioKm=%s', async (valor) => {
      const res = await pedir(`${BASE}&radioKm=${valor}`);
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain('radioKm');
    });

    it.each([['0.1'], ['20'], ['5']])('200 con radioKm=%s', async (valor) => {
      expect((await pedir(`${BASE}&radioKm=${valor}`)).status).toBe(200);
    });

    it('por defecto 5 km: un lugar a 4 km entra y uno a 6 km no; radioKm=7 incluye el segundo', async () => {
      const dentro = reporteEn(lugarA(4).id);
      const fuera = reporteEn(lugarA(6).id);
      expect(ids(await pedir(BASE))).toEqual([dentro]);
      expect(ids(await pedir(`${BASE}&radioKm=7`))).toEqual([dentro, fuera]);
    });
  });

  describe('horas (1..24, 3 por defecto)', () => {
    it.each([['0'], ['25'], ['-1'], ['1.5'], ['abc']])('400 con horas=%s', async (valor) => {
      const res = await pedir(`${BASE}&horas=${valor}`);
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain('horas');
    });

    it.each([['1'], ['24']])('200 con horas=%s', async (valor) => {
      expect((await pedir(`${BASE}&horas=${valor}`)).status).toBe(200);
    });

    it('la ventana incluye el borde: con horas=1 entra 60 min y no 61 min; por defecto 3 h', async () => {
      const lugar = lugarA(1);
      const enBorde = reporteEn(lugar.id, 60);
      const pasado = reporteEn(lugar.id, 61);
      const tresHoras = reporteEn(lugar.id, 180);
      expect(ids(await pedir(`${BASE}&horas=1`))).toEqual([enBorde]);
      expect(ids(await pedir(BASE))).toEqual([enBorde, pasado, tresHoras]);
      expect(ids(await pedir(`${BASE}&horas=24`))).toEqual([enBorde, pasado, tresHoras]);
    });
  });

  describe('page (>=1, 1 por defecto) y size (1..50, 20 por defecto)', () => {
    it.each([['page=0'], ['page=-1'], ['page=abc'], ['size=0'], ['size=51'], ['size=abc'], ['size=2.5']])(
      '400 con %s',
      async (consulta) => {
        const res = await pedir(`${BASE}&${consulta}`);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDACION_FALLIDA');
      },
    );

    it.each([['size=1'], ['size=50'], ['page=1'], ['page=999']])('200 con %s', async (consulta) => {
      expect((await pedir(`${BASE}&${consulta}`)).status).toBe(200);
    });

    it('pagina de forma consistente: size=2 reparte 5 reportes en 3 paginas sin repetir', async () => {
      const lugar = lugarA(1);
      const todos = [10, 20, 30, 40, 50].map((m) => reporteEn(lugar.id, m));
      const paginas = [];
      for (const page of [1, 2, 3]) paginas.push(await pedir(`${BASE}&size=2&page=${page}`));
      expect(paginas.map(ids)).toEqual([todos.slice(0, 2), todos.slice(2, 4), todos.slice(4)]);
      expect(paginas[0]?.body.data).toMatchObject({ total: 5, totalPaginas: 3, size: 2, page: 1 });
      expect(paginas[2]?.body.data.items).toHaveLength(1);
    });

    it('una pagina mas alla del final es 200 vacia con el total real', async () => {
      reporteEn(lugarA(1).id);
      const res = await pedir(`${BASE}&page=5`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ items: [], total: 1, page: 5 });
    });
  });
});
