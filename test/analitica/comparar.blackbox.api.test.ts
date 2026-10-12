/**
 * Integrante: stream M4 (reportes y karma)
 * Tecnica: caja negra, particiones de equivalencia + valores limite + tabla de decision
 * Metodo: GET /api/lugares/:id/comparar (spec M4 R12, S17), 6 entradas: desdeA, hastaA, diasA, desdeB, hastaB, diasB
 *   - fechas: formato AAAA-MM-DD valido | formato invalido | ausente (4 entradas, obligatorias)
 *   - rango (hasta - desde): 1, 31 validos | 0, 32, negativo invalidos (limites 0/1 y 31/32), por periodo
 *   - dias: TODOS | LABORABLES | FIN_DE_SEMANA | valor desconocido (400) | ausente (por defecto TODOS)
 *   - tabla de decision: (muestras de A >= minimo, muestras de B >= minimo) -> suficiente (4 combinaciones)
 *   - ademas: sin token 401, lugar inexistente 404, id de lugar no numerico 400
 * "Ahora" es miercoles 2026-10-07 10:00 hora de Lima; el minimo de muestras es ANALITICA_MIN_MUESTRAS = 5.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { crearSembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { crearContenedorPrueba, type ContenedorPrueba } from '../support/crearContenedorPrueba.js';
import { aReporte, aUsuario } from '../support/fabrica/datos.js';

const MIN = 5;
const BASE = {
  desdeA: '2026-09-10',
  hastaA: '2026-10-07',
  diasA: 'LABORABLES',
  desdeB: '2026-09-10',
  hastaB: '2026-10-07',
  diasB: 'FIN_DE_SEMANA',
};
type Entrada = Record<string, string | undefined>;

describe('GET /api/lugares/:id/comparar (caja negra)', () => {
  let ctx: ContenedorPrueba;
  let app: ReturnType<typeof createApp>;
  let lugarId: number;
  let cabecera: Record<string, string>;
  let autor: number;

  /** `n` reports at 12:00 Lima of `dia`. */
  const sembrar = (n: number, dia: string) => {
    for (let i = 0; i < n; i += 1) {
      ctx.reporteDAO.agregar(
        aReporte({
          usuarioId: autor,
          lugarId,
          nivelSaturacion: NivelSaturacion.MODERADO,
          fechaHora: new Date(`${dia}T17:${String(i).padStart(2, '0')}:00Z`),
        }),
      );
    }
  };
  /** Monday 2026-10-05 is a weekday and Saturday 2026-10-03 a weekend day. */
  const sembrarAmbos = (laborables = MIN, finDeSemana = MIN) => {
    sembrar(laborables, '2026-10-05');
    sembrar(finDeSemana, '2026-10-03');
  };
  const comparar = (entrada: Entrada = {}, id: number | string = lugarId) => {
    const consulta = { ...BASE, ...entrada };
    const params = Object.entries(consulta).filter((par): par is [string, string] => par[1] !== undefined);
    return request(app).get(`/api/lugares/${id}/comparar`).query(Object.fromEntries(params)).set(cabecera);
  };

  beforeEach(async () => {
    const sembrador = crearSembradorMemoria();
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

  describe('forma de la respuesta con entradas validas', () => {
    it('200 con 24 franjas por periodo, diferencias, resumen y suficiente=true', async () => {
      sembrarAmbos();
      const res = await comparar();
      expect(res.status).toBe(200);
      expect(res.body.data.suficiente).toBe(true);
      expect(res.body.data.periodoA).toHaveLength(24);
      expect(res.body.data.periodoB).toHaveLength(24);
      expect(res.body.data.periodoA[12]).toEqual({ hora: 12, valor: 2, muestras: MIN });
      expect(res.body.data.diferencias).toEqual([{ hora: 12, diferencia: 0 }]);
      expect(res.body.data).toMatchObject({
        resumen: 'No hay diferencias notables entre ambos periodos.',
        mensaje: null,
        sintetico: false,
      });
    });
  });

  describe('rango de cada periodo (valores limite)', () => {
    it.each([
      ['A de 31 dias', { desdeA: '2026-09-06' }, 200],
      ['A de 32 dias', { desdeA: '2026-09-05' }, 400],
      ['B de 31 dias', { desdeB: '2026-09-06' }, 200],
      ['B de 32 dias', { desdeB: '2026-09-05' }, 400],
      ['A de 1 dia', { desdeA: '2026-10-06' }, 200],
      ['A con desde igual a hasta (0 dias)', { desdeA: '2026-10-07' }, 400],
      ['B con desde igual a hasta (0 dias)', { desdeB: '2026-10-07' }, 400],
      ['A con desde posterior a hasta', { desdeA: '2026-10-08' }, 400],
      ['B con desde posterior a hasta', { hastaB: '2026-09-09' }, 400],
    ])('%s -> %i', async (_caso, entrada: Entrada, estado) => {
      sembrarAmbos();
      const res = await comparar(entrada);
      expect(res.status).toBe(estado);
      if (estado === 400) expect(res.body.code).toBe('RANGO_FECHAS_INVALIDO');
    });
  });

  describe('entradas de fecha', () => {
    it.each(['desdeA', 'hastaA', 'desdeB', 'hastaB'])('falta %s -> 400 VALIDACION_FALLIDA que nombra el campo', async (campo) => {
      const res = await comparar({ [campo]: undefined });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain(campo);
    });

    it.each([
      ['desdeA', '07/10/2026'],
      ['hastaA', 'abc'],
      ['desdeB', '2026-13-01'],
      ['hastaB', '2026-02-30'],
      ['desdeA', ''],
    ])('%s con formato invalido "%s" -> 400 VALIDACION_FALLIDA', async (campo, valor) => {
      const res = await comparar({ [campo]: valor });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain(campo);
    });
  });

  describe('entradas de dias', () => {
    it.each(['TODOS', 'LABORABLES', 'FIN_DE_SEMANA'])('diasA=%s y diasB=%s son validos', async (dias) => {
      sembrarAmbos();
      expect((await comparar({ diasA: dias, diasB: dias })).status).toBe(200);
    });

    it.each(['diasA', 'diasB'])('%s desconocido -> 400 VALIDACION_FALLIDA que nombra el campo', async (campo) => {
      const res = await comparar({ [campo]: 'LUNES' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors.map((e: { campo: string }) => e.campo)).toContain(campo);
    });

    it.each(['diasA', 'diasB'])('sin %s se toma TODOS', async (campo) => {
      sembrarAmbos();
      const res = await comparar({ [campo]: undefined });
      expect(res.status).toBe(200);
      expect(res.body.data.suficiente).toBe(true);
    });

    it('los dias separan los periodos: LABORABLES contra FIN_DE_SEMANA no mezcla sus reportes', async () => {
      sembrar(MIN, '2026-10-05'); // only weekday data
      const res = await comparar();
      expect(res.body.data.suficiente).toBe(false);
      expect(res.body.data.periodoA[12].muestras).toBe(MIN);
      expect(res.body.data.periodoB[12].muestras).toBe(0);
    });
  });

  describe('tabla de decision: muestras suficientes en A y en B', () => {
    it.each([
      ['A suficiente, B suficiente', MIN, MIN, true],
      ['A suficiente, B insuficiente', MIN, MIN - 1, false],
      ['A insuficiente, B suficiente', MIN - 1, MIN, false],
      ['A insuficiente, B insuficiente', MIN - 1, MIN - 1, false],
    ])('%s -> suficiente=%s', async (_caso, muestrasA, muestrasB, suficiente) => {
      sembrarAmbos(muestrasA, muestrasB);
      const res = await comparar();
      expect(res.status).toBe(200);
      expect(res.body.data.suficiente).toBe(suficiente);
      if (!suficiente) {
        expect(res.body.data.mensaje).toBe('No existen datos suficientes para realizar la comparación.');
        expect(res.body.data.resumen).toBeNull();
        expect(res.body.data.diferencias).toEqual([]);
      }
    });
  });

  describe('autenticacion y lugar', () => {
    it('sin token -> 401 NO_AUTENTICADO', async () => {
      const res = await request(app).get(`/api/lugares/${lugarId}/comparar`).query(BASE);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_AUTENTICADO');
    });

    it('lugar inexistente -> 404 LUGAR_NO_ENCONTRADO', async () => {
      const res = await comparar({}, lugarId + 999);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('LUGAR_NO_ENCONTRADO');
    });

    it('id de lugar no numerico -> 400 VALIDACION_FALLIDA', async () => {
      const res = await comparar({}, 'abc');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDACION_FALLIDA');
    });
  });
});
