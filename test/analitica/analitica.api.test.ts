/**
 * API tests of GET /api/lugares/:id/historial against the fake container (no database):
 * parameters, shapes the app parses, synthetic-data marker. Spec M4 R11, R14, S15-S17.
 * "Ahora" es miercoles 2026-10-07 10:00 hora de Lima.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { crearSembradorMemoria, type SembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

describe('API de analitica (contenedor de prueba)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let sembrador: SembradorMemoria;
  let lugarId: number;
  let cabecera: Record<string, string>;
  let autor: number;

  /** `n` reports of `nivel` at `hora` o'clock Lima of `dia`. */
  const sembrar = (n: number, dia: string, hora: number, nivel: NivelSaturacion, usuarioId = autor) => {
    for (let i = 0; i < n; i += 1) {
      const [a, m, d] = dia.split('-').map(Number) as [number, number, number];
      ctx.reporteDAO.agregar(
        aReporte({ usuarioId, lugarId, nivelSaturacion: nivel, fechaHora: new Date(Date.UTC(a, m - 1, d, hora + 5, i)) }),
      );
    }
  };
  const get = (ruta: string, consulta: Record<string, string> = {}, token = cabecera) =>
    request(app).get(`/api/lugares/${lugarId}/${ruta}`).query(consulta).set(token);

  beforeEach(async () => {
    sembrador = crearSembradorMemoria();
    autor = await sembrador.usuario();
    ctx = crearContenedorPrueba({
      reloj: new RelojFijo(new Date('2026-10-07T15:00:00Z')),
      reporteDAO: new ReporteDAOMemoria({ sembrador }),
    });
    app = createApp(ctx.contenedor);
    lugarId = ctx.lugarDAO.agregar({ horaApertura: 8, horaCierre: 22 }).id;
    const usuario = ctx.usuarioDAO.agregar(aUsuario());
    cabecera = { Authorization: `Bearer ${ctx.emisorToken.emitir(usuario).token}` };
  });

  describe('GET historial', () => {
    it('sin parametros: hoy por horas, cronologico, con promedio y muestras (S15)', async () => {
      sembrar(2, '2026-10-07', 9, NivelSaturacion.MODERADO);
      sembrar(1, '2026-10-07', 14, NivelSaturacion.SATURADO);
      const res = await get('historial');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        puntos: [
          { etiqueta: '09:00', valor: 2, muestras: 2 },
          { etiqueta: '14:00', valor: 3, muestras: 1 },
        ],
        hayDatos: true,
        mensaje: null,
        sintetico: false,
      });
    });

    it('agrupacion=DIA con desde y hasta: un punto por dia', async () => {
      sembrar(1, '2026-10-05', 9, NivelSaturacion.TRANQUILO);
      sembrar(1, '2026-10-06', 9, NivelSaturacion.SATURADO);
      const res = await get('historial', { agrupacion: 'DIA', desde: '2026-10-01', hasta: '2026-10-07' });
      expect(res.status).toBe(200);
      expect(res.body.data.puntos).toEqual([
        { etiqueta: '2026-10-05', valor: 1, muestras: 1 },
        { etiqueta: '2026-10-06', valor: 3, muestras: 1 },
      ]);
    });

    it('sin datos: 200 con hayDatos=false y el mensaje (S16)', async () => {
      const res = await get('historial');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        puntos: [],
        hayDatos: false,
        mensaje: 'No existe información histórica disponible para este lugar.',
        sintetico: false,
      });
    });

    it('los datos de usuarios de demostracion salen con sintetico=true', async () => {
      sembrar(1, '2026-10-07', 9, NivelSaturacion.MODERADO, await sembrador.usuarioSintetico());
      expect((await get('historial')).body.data.sintetico).toBe(true);
    });

    it.each([
      ['rango de 32 dias', { agrupacion: 'DIA', desde: '2026-09-05', hasta: '2026-10-07' }],
      ['desde igual a hasta', { desde: '2026-10-05', hasta: '2026-10-05' }],
    ])('400 RANGO_FECHAS_INVALIDO: %s (S17)', async (_caso, consulta) => {
      const res = await get('historial', consulta);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('RANGO_FECHAS_INVALIDO');
    });

    it.each([
      ['agrupacion invalida', { agrupacion: 'SEMANA' }, 'agrupacion'],
      ['fecha con formato invalido', { desde: '5/10/2026' }, 'desde'],
      ['clave desconocida', { foo: 'x' }, 'foo'],
    ])('400 VALIDACION_FALLIDA: %s', async (_caso, consulta, campo) => {
      const res = await get('historial', consulta);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain(campo);
    });

    it('404 para un lugar inexistente y 401 sin token', async () => {
      const res = await request(app).get(`/api/lugares/${lugarId + 999}/historial`).set(cabecera);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('LUGAR_NO_ENCONTRADO');
      expect((await request(app).get(`/api/lugares/${lugarId}/historial`)).status).toBe(401);
    });
  });
});
