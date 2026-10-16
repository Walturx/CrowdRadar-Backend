/**
 * Unit tests of AnaliticaServiceImpl over the in-memory DAOs: history, period comparison and best hour
 * (spec M4 R11-R13, S15-S17). Times are Lima (UTC-5); "now" is Wednesday 2026-10-07 10:00 Lima.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';
import { AgrupacionHistorial } from '../../src/enum/AgrupacionHistorial.js';
import { FiltroDias } from '../../src/enum/FiltroDias.js';
import { NivelSaturacion } from '../../src/enum/NivelSaturacion.js';
import { CodigoError } from '../../src/exception/CodigoError.js';
import { AnaliticaServiceImpl } from '../../src/service/impl/AnaliticaServiceImpl.js';
import { RelojFijo } from '../support/RelojFijo.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { crearSembradorMemoria, type SembradorMemoria } from '../support/dao/memoria/SembradorMemoria.js';
import { aReporte } from '../support/fabrica/datos.js';

const AHORA = new Date('2026-10-07T15:00:00Z');
const VALOR = { TRANQUILO: NivelSaturacion.TRANQUILO, MODERADO: NivelSaturacion.MODERADO, SATURADO: NivelSaturacion.SATURADO };
const MIN = 5;

describe('AnaliticaServiceImpl', () => {
  let sembrador: SembradorMemoria;
  let reporteDAO: ReporteDAOMemoria;
  let lugarDAO: LugarDAOMemoria;
  let servicio: AnaliticaServiceImpl;
  let lugarId: number;
  let autor: number;

  /** One report at `hora` o'clock Lima of calendar day `dia`. */
  const reportar = (dia: string, hora: number, nivel: NivelSaturacion, extra: { usuarioId?: number; lugarId?: number; estado?: EstadoReporte } = {}) => {
    const [anio, mes, d] = dia.split('-').map(Number) as [number, number, number];
    reporteDAO.agregar(
      aReporte({
        usuarioId: extra.usuarioId ?? autor,
        lugarId: extra.lugarId ?? lugarId,
        nivelSaturacion: nivel,
        fechaHora: new Date(Date.UTC(anio, mes - 1, d, hora + 5, 10)),
        ...(extra.estado ? { estado: extra.estado } : {}),
      }),
    );
  };
  /** `n` reports of the same level at the same hour (to reach the minimum sample count). */
  const muchos = (n: number, dia: string, hora: number, nivel: NivelSaturacion) => {
    for (let i = 0; i < n; i += 1) reportar(dia, hora, nivel);
  };

  beforeEach(async () => {
    sembrador = crearSembradorMemoria();
    reporteDAO = new ReporteDAOMemoria({ sembrador });
    lugarDAO = new LugarDAOMemoria();
    lugarId = lugarDAO.agregar({ horaApertura: 8, horaCierre: 22 }).id;
    autor = await sembrador.usuario();
    servicio = new AnaliticaServiceImpl({
      lugarDAO,
      reporteDAO,
      reloj: new RelojFijo(AHORA),
      zonaHoraria: 'America/Lima',
      minMuestras: MIN,
      umbralModerado: 1.67,
      umbralSaturado: 2.34,
    });
  });

  describe('obtenerHistorial', () => {
    it('HORA sin fechas es hoy: puntos cronologicos 09:00 y 14:00 con promedio y muestras (S15)', async () => {
      reportar('2026-10-07', 9, VALOR.MODERADO);
      reportar('2026-10-07', 9, VALOR.SATURADO);
      reportar('2026-10-07', 14, VALOR.TRANQUILO);
      reportar('2026-10-06', 9, VALOR.SATURADO); // yesterday: out of the default range
      const r = await servicio.obtenerHistorial(lugarId, { agrupacion: AgrupacionHistorial.HORA });
      expect(r).toEqual({
        hayDatos: true,
        sintetico: false,
        puntos: [
          { etiqueta: '09:00', valor: 2.5, muestras: 2 },
          { etiqueta: '14:00', valor: 1, muestras: 1 },
        ],
      });
    });

    it('HORA sobre varios dias junta la misma hora ponderando por muestras', async () => {
      reportar('2026-10-06', 9, VALOR.TRANQUILO);
      reportar('2026-10-07', 9, VALOR.SATURADO);
      reportar('2026-10-07', 9, VALOR.SATURADO);
      const r = await servicio.obtenerHistorial(lugarId, {
        agrupacion: AgrupacionHistorial.HORA,
        desde: '2026-10-06',
        hasta: '2026-10-07',
      });
      expect(r.puntos).toEqual([{ etiqueta: '09:00', valor: 2.33, muestras: 3 }]);
    });

    it('DIA sin fechas son los ultimos 7 dias hasta hoy; cada dia se calcula a partir de las horas', async () => {
      reportar('2026-10-05', 9, VALOR.TRANQUILO);
      reportar('2026-10-05', 15, VALOR.SATURADO);
      reportar('2026-10-05', 15, VALOR.SATURADO);
      reportar('2026-10-07', 10, VALOR.MODERADO);
      reportar('2026-09-30', 10, VALOR.SATURADO); // 7 days back is 2026-10-01: out
      const r = await servicio.obtenerHistorial(lugarId, { agrupacion: AgrupacionHistorial.DIA });
      expect(r.puntos).toEqual([
        { etiqueta: '2026-10-05', valor: 2.33, muestras: 3 },
        { etiqueta: '2026-10-07', valor: 2, muestras: 1 },
      ]);
    });

    it('ignora reportes ELIMINADO y de otros lugares', async () => {
      reportar('2026-10-07', 9, VALOR.SATURADO, { estado: EstadoReporte.ELIMINADO });
      reportar('2026-10-07', 9, VALOR.SATURADO, { lugarId: lugarId + 99 });
      reportar('2026-10-07', 9, VALOR.TRANQUILO);
      const r = await servicio.obtenerHistorial(lugarId, { agrupacion: AgrupacionHistorial.HORA });
      expect(r.puntos).toEqual([{ etiqueta: '09:00', valor: 1, muestras: 1 }]);
    });

    it('sin reportes responde hayDatos=false y puntos vacios, no un error (S16)', async () => {
      expect(await servicio.obtenerHistorial(lugarId, { agrupacion: AgrupacionHistorial.DIA })).toEqual({
        hayDatos: false,
        sintetico: false,
        puntos: [],
      });
    });

    it('marca sintetico cuando algun reporte del rango es de un usuario de demostracion', async () => {
      reportar('2026-10-07', 9, VALOR.MODERADO, { usuarioId: await sembrador.usuarioSintetico() });
      expect((await servicio.obtenerHistorial(lugarId, { agrupacion: AgrupacionHistorial.HORA })).sintetico).toBe(true);
    });

    it.each([
      ['32 dias de diferencia', '2026-09-05', '2026-10-07'],
      ['desde igual a hasta', '2026-10-07', '2026-10-07'],
      ['desde posterior a hasta', '2026-10-07', '2026-10-01'],
    ])('rechaza el rango con RANGO_FECHAS_INVALIDO: %s (S17)', async (_caso, desde, hasta) => {
      await expect(
        servicio.obtenerHistorial(lugarId, { agrupacion: AgrupacionHistorial.DIA, desde, hasta }),
      ).rejects.toMatchObject({ status: 400, code: CodigoError.RANGO_FECHAS_INVALIDO });
    });

    it('31 dias de diferencia es el maximo permitido', async () => {
      await expect(
        servicio.obtenerHistorial(lugarId, { agrupacion: AgrupacionHistorial.DIA, desde: '2026-09-06', hasta: '2026-10-07' }),
      ).resolves.toMatchObject({ hayDatos: false });
    });

    it('un lugar inexistente es 404 LUGAR_NO_ENCONTRADO', async () => {
      await expect(servicio.obtenerHistorial(lugarId + 99, { agrupacion: AgrupacionHistorial.HORA })).rejects.toMatchObject({
        status: 404,
        code: CodigoError.LUGAR_NO_ENCONTRADO,
      });
    });
  });

  describe('compararPeriodos', () => {
    const laborables = { desde: '2026-10-05', hasta: '2026-10-11', dias: FiltroDias.LABORABLES };
    const finDeSemana = { desde: '2026-10-05', hasta: '2026-10-11', dias: FiltroDias.FIN_DE_SEMANA };

    /** Weekdays (Mon 5th) calm at 12h, weekend (Sat 10th) busy 11h-13h. */
    const sembrarContraste = () => {
      muchos(MIN, '2026-10-05', 12, VALOR.TRANQUILO);
      muchos(MIN, '2026-10-10', 11, VALOR.SATURADO);
      muchos(MIN, '2026-10-10', 12, VALOR.SATURADO);
      muchos(MIN, '2026-10-10', 13, VALOR.SATURADO);
    };

    it('devuelve 24 franjas por periodo con valor y muestras, separando laborables de fin de semana', async () => {
      sembrarContraste();
      const r = await servicio.compararPeriodos(lugarId, laborables, finDeSemana);
      expect(r.periodoA).toHaveLength(24);
      expect(r.periodoB).toHaveLength(24);
      expect(r.periodoA[12]).toEqual({ hora: 12, valor: 1, muestras: MIN });
      expect(r.periodoB[12]).toEqual({ hora: 12, valor: 3, muestras: MIN });
      expect(r.periodoA[3]).toEqual({ hora: 3, valor: 0, muestras: 0 });
      expect(r.suficiente).toBe(true);
    });

    it('la diferencia es B menos A solo en las horas con datos en ambos periodos y la banda es la mayor racha notable', async () => {
      sembrarContraste();
      muchos(MIN, '2026-10-05', 11, VALOR.MODERADO);
      muchos(MIN, '2026-10-05', 13, VALOR.SATURADO);
      const r = await servicio.compararPeriodos(lugarId, laborables, finDeSemana);
      expect(r.diferencias).toEqual([
        { hora: 11, diferencia: 1 },
        { hora: 12, diferencia: 2 },
        { hora: 13, diferencia: 0 },
      ]);
      expect(r.bandaMayorAfluencia).toEqual({ horaInicio: 11, horaFin: 13 });
      expect(r.diasB).toBe(FiltroDias.FIN_DE_SEMANA);
    });

    it('sin horas que suban de forma notable no hay banda', async () => {
      muchos(MIN, '2026-10-05', 12, VALOR.MODERADO);
      muchos(MIN, '2026-10-10', 12, VALOR.MODERADO);
      const r = await servicio.compararPeriodos(lugarId, laborables, finDeSemana);
      expect(r.bandaMayorAfluencia).toBeNull();
      expect(r.suficiente).toBe(true);
    });

    it('con menos muestras que el minimo en un periodo no hay datos suficientes (borde MIN-1 / MIN)', async () => {
      muchos(MIN, '2026-10-05', 12, VALOR.TRANQUILO);
      muchos(MIN - 1, '2026-10-10', 12, VALOR.SATURADO);
      const corto = await servicio.compararPeriodos(lugarId, laborables, finDeSemana);
      expect(corto.suficiente).toBe(false);
      expect(corto.diferencias).toEqual([]);
      expect(corto.bandaMayorAfluencia).toBeNull();
      reportar('2026-10-10', 12, VALOR.SATURADO);
      expect((await servicio.compararPeriodos(lugarId, laborables, finDeSemana)).suficiente).toBe(true);
    });

    it('las muestras se suman en todo el periodo, no por hora (borde del minimo)', async () => {
      for (let h = 8; h < 8 + MIN; h += 1) {
        reportar('2026-10-05', h, VALOR.MODERADO);
        reportar('2026-10-10', h, VALOR.MODERADO);
      }
      expect((await servicio.compararPeriodos(lugarId, laborables, finDeSemana)).suficiente).toBe(true);
    });

    it.each([
      ['rango A de 32 dias', { ...laborables, desde: '2026-09-09' }, finDeSemana],
      ['rango B con desde igual a hasta', laborables, { ...finDeSemana, desde: '2026-10-11' }],
    ])('rechaza con RANGO_FECHAS_INVALIDO: %s', async (_caso, a, b) => {
      await expect(servicio.compararPeriodos(lugarId, a, b)).rejects.toMatchObject({
        status: 400,
        code: CodigoError.RANGO_FECHAS_INVALIDO,
      });
    });

    it('un lugar inexistente es 404 y un periodo sintetico marca sintetico', async () => {
      await expect(servicio.compararPeriodos(lugarId + 99, laborables, finDeSemana)).rejects.toMatchObject({ status: 404 });
      sembrarContraste();
      reportar('2026-10-10', 15, VALOR.MODERADO, { usuarioId: await sembrador.usuarioSintetico() });
      expect((await servicio.compararPeriodos(lugarId, laborables, finDeSemana)).sintetico).toBe(true);
    });
  });

  describe('obtenerMejorHorario', () => {
    it('recomienda las 3 horas mas tranquilas dentro del horario de apertura, con su nivel', async () => {
      muchos(MIN, '2026-10-06', 9, VALOR.TRANQUILO); // 1.0
      muchos(MIN, '2026-10-06', 11, VALOR.MODERADO); // 2.0
      muchos(MIN, '2026-10-06', 13, VALOR.SATURADO); // 3.0
      muchos(MIN, '2026-10-06', 15, VALOR.TRANQUILO);
      reportar('2026-10-06', 15, VALOR.MODERADO); // 1.17, 6 samples
      muchos(MIN, '2026-10-06', 3, VALOR.TRANQUILO); // outside opening hours
      const r = await servicio.obtenerMejorHorario(lugarId, FiltroDias.TODOS, 4);
      expect(r.recomendaciones).toEqual([
        { horaInicio: 9, horaFin: 10, nivel: 'TRANQUILO', promedio: 1, muestras: MIN },
        { horaInicio: 15, horaFin: 16, nivel: 'TRANQUILO', promedio: 1.17, muestras: MIN + 1 },
        { horaInicio: 11, horaFin: 12, nivel: 'MODERADO', promedio: 2, muestras: MIN },
      ]);
      expect(r.hayDatos).toBe(true);
    });

    it('desempata por mas muestras y luego por hora; excluye horas con menos muestras que el minimo', async () => {
      muchos(MIN + 2, '2026-10-06', 14, VALOR.TRANQUILO);
      muchos(MIN, '2026-10-06', 10, VALOR.TRANQUILO);
      muchos(MIN, '2026-10-06', 9, VALOR.TRANQUILO);
      muchos(MIN - 1, '2026-10-06', 12, VALOR.TRANQUILO);
      const r = await servicio.obtenerMejorHorario(lugarId, FiltroDias.TODOS, 4);
      expect(r.recomendaciones.map((f) => f.horaInicio)).toEqual([14, 9, 10]);
    });

    it('un horario que cruza la medianoche (20 a 02) incluye las horas de madrugada y excluye las de la manana', async () => {
      const noche = lugarDAO.agregar({ horaApertura: 20, horaCierre: 2 }).id;
      for (const hora of [22, 1, 10]) {
        for (let i = 0; i < MIN; i += 1) reportar('2026-10-06', hora, VALOR.TRANQUILO, { lugarId: noche });
      }
      const r = await servicio.obtenerMejorHorario(noche, FiltroDias.TODOS, 4);
      expect(r.recomendaciones.map((f) => f.horaInicio)).toEqual([1, 22]);
    });

    it('un lugar sin horario conocido usa 08:00 a 22:00', async () => {
      const sinHorario = lugarDAO.agregar({ horaApertura: null, horaCierre: null }).id;
      for (const hora of [7, 9, 22]) {
        for (let i = 0; i < MIN; i += 1) reportar('2026-10-06', hora, VALOR.TRANQUILO, { lugarId: sinHorario });
      }
      const r = await servicio.obtenerMejorHorario(sinHorario, FiltroDias.TODOS, 4);
      expect(r.recomendaciones.map((f) => f.horaInicio)).toEqual([9]);
    });

    it('semanas acota la ventana hacia atras desde hoy y dias filtra laborables o fin de semana', async () => {
      muchos(MIN, '2026-10-06', 9, VALOR.TRANQUILO); // Tuesday, 1 day ago
      muchos(MIN, '2026-09-20', 10, VALOR.TRANQUILO); // Sunday, 17 days ago
      const una = await servicio.obtenerMejorHorario(lugarId, FiltroDias.TODOS, 1);
      expect(una.recomendaciones.map((f) => f.horaInicio)).toEqual([9]);
      const tres = await servicio.obtenerMejorHorario(lugarId, FiltroDias.TODOS, 3);
      expect(tres.recomendaciones.map((f) => f.horaInicio)).toEqual([9, 10]);
      const finde = await servicio.obtenerMejorHorario(lugarId, FiltroDias.FIN_DE_SEMANA, 3);
      expect(finde.recomendaciones.map((f) => f.horaInicio)).toEqual([10]);
    });

    it('sin horas con muestras suficientes no hay recomendacion', async () => {
      muchos(MIN - 1, '2026-10-06', 9, VALOR.TRANQUILO);
      expect(await servicio.obtenerMejorHorario(lugarId, FiltroDias.TODOS, 4)).toEqual({
        hayDatos: false,
        sintetico: false,
        recomendaciones: [],
      });
    });

    it('marca sintetico y devuelve 404 para un lugar inexistente', async () => {
      const demo = await sembrador.usuarioSintetico();
      for (let i = 0; i < MIN; i += 1) reportar('2026-10-06', 9, VALOR.TRANQUILO, { usuarioId: demo });
      expect((await servicio.obtenerMejorHorario(lugarId, FiltroDias.TODOS, 4)).sintetico).toBe(true);
      await expect(servicio.obtenerMejorHorario(lugarId + 99, FiltroDias.TODOS, 4)).rejects.toMatchObject({ status: 404 });
    });
  });
});
