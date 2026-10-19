/**
 * The hand-written SQL of the Sequelize DAOs (sqlCrudo.ts and the hot paths that use it), without a database: the
 * models are registered on an instance that never connects and `sequelize.query` is a fake that records each
 * statement and answers canned rows. The DAO contracts on PostgreSQL (`npm run test:db`) prove the SQL runs; these pin
 * the logic around it (column lists, the page-past-end count, the no-op update) in the plain `npm test` run.
 * Listed in ARCHIVOS_AISLADOS because it rebinds the global model classes to that instance.
 */
import { Sequelize } from 'sequelize';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextoReporteDAOSequelize } from '../../src/dao/impl/sequelize/ContextoReporteDAOSequelize.js';
import { DenunciaDAOSequelize } from '../../src/dao/impl/sequelize/DenunciaDAOSequelize.js';
import { initModels } from '../../src/dao/impl/sequelize/model/initModels.js';
import { ReporteModel } from '../../src/dao/impl/sequelize/model/ReporteModel.js';
import { ReporteDAOSequelize } from '../../src/dao/impl/sequelize/ReporteDAOSequelize.js';
import { campoDe, columnasDe } from '../../src/dao/impl/sequelize/sqlCrudo.js';
import { EstadoReporte } from '../../src/enum/EstadoReporte.js';

const sequelize = new Sequelize('postgres://nadie:nada@127.0.0.1:1/ninguna', { dialect: 'postgres', logging: false });
initModels(sequelize);

interface Sentencia {
  sql: string;
  replacements: Record<string, unknown>;
}
let sentencias: Sentencia[] = [];
/** Rows the fake answers, one array per statement in order; an exhausted queue answers []. */
let respuestas: unknown[][] = [];

beforeEach(() => {
  sentencias = [];
  respuestas = [];
  vi.spyOn(sequelize, 'query').mockImplementation((async (sql: string, opciones?: { replacements?: Record<string, unknown> }) => {
    sentencias.push({ sql: sql.replace(/\s+/g, ' ').trim(), replacements: opciones?.replacements ?? {} });
    return respuestas.shift() ?? [];
  }) as never);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await sequelize.close();
});

const filaReporte = (extra: Record<string, unknown> = {}) => ({
  id: 9,
  usuarioId: 1,
  lugarId: 2,
  nivelSaturacion: 'MODERADO',
  fechaHora: new Date('2026-10-05T14:00:00Z'),
  nivelConfiabilidad: '66.67',
  estado: 'ACTIVO',
  puntosOtorgados: 10,
  motivoSinPuntos: null,
  createdAt: new Date('2026-10-05T14:00:00Z'),
  updatedAt: new Date('2026-10-05T14:00:00Z'),
  ...extra,
});

describe('sqlCrudo sobre los modelos registrados', () => {
  it('columnasDe lista "columna" AS "atributo" de cada atributo, igual en cada llamada (cacheada)', () => {
    const columnas = columnasDe(ReporteModel);
    expect(columnas).toContain('"puntos_otorgados" AS "puntosOtorgados"');
    expect(columnas).toContain('"id" AS "id"');
    expect(columnas.split(', ')).toHaveLength(Object.keys(ReporteModel.getAttributes()).length);
    expect(columnasDe(ReporteModel)).toBe(columnas);
  });

  it('campoDe traduce el atributo a su columna y rechaza uno desconocido', () => {
    expect(campoDe(ReporteModel, 'motivoSinPuntos')).toBe('motivo_sin_puntos');
    expect(() => campoDe(ReporteModel, 'inventado')).toThrow('Atributo desconocido Reporte.inventado');
  });
});

describe('ReporteDAOSequelize.modificar (via registrarPuntos y actualizarConfiabilidad)', () => {
  it('un UPDATE ... RETURNING con los reemplazos internos __id y __ahora, y el DECIMAL devuelto como number', async () => {
    respuestas = [[filaReporte()]];
    const reporte = await new ReporteDAOSequelize().registrarPuntos(9, 10, null);
    expect(sentencias).toHaveLength(1);
    expect(sentencias[0]!.sql).toMatch(
      /^UPDATE reporte_saturacion SET "puntos_otorgados" = :puntosOtorgados, "motivo_sin_puntos" = :motivoSinPuntos, updated_at = :__ahora WHERE id = :__id RETURNING /,
    );
    expect(sentencias[0]!.replacements).toMatchObject({ puntosOtorgados: 10, motivoSinPuntos: null, __id: 9 });
    expect(sentencias[0]!.replacements.__ahora).toBeInstanceOf(Date);
    expect(reporte).toMatchObject({ id: 9, nivelConfiabilidad: 66.67, estado: EstadoReporte.ACTIVO });
  });

  it('sin nada que cambiar no envia UPDATE: lee la fila (o null si no existe)', async () => {
    respuestas = [[filaReporte()]];
    const dao = new ReporteDAOSequelize();
    expect(await dao.actualizarConfiabilidad(9, undefined as unknown as number)).toMatchObject({ id: 9 });
    expect(await dao.actualizarEstado(10, undefined as unknown as EstadoReporte)).toBeNull();
    expect(sentencias.map((s) => s.sql.split(' ')[0])).toEqual(['SELECT', 'SELECT']);
  });

  it('una fila que no existe devuelve null', async () => {
    expect(await new ReporteDAOSequelize().actualizarEstado(404, EstadoReporte.ELIMINADO)).toBeNull();
  });
});

describe('DenunciaDAOSequelize.listarReportesConPendientes', () => {
  const fila = (reporteId: number, total: number) => ({ reporteId, pendientes: 2, ultimaDenunciaEn: '2026-10-05T14:00:00.000Z', total });

  it('una sola sentencia: el total viaja en las filas (COUNT(*) OVER ()) y deja fuera los ELIMINADO', async () => {
    respuestas = [[fila(7, 3), fila(5, 3)]];
    const pagina = await new DenunciaDAOSequelize().listarReportesConPendientes({ page: 1, size: 2 });
    expect(pagina).toMatchObject({ total: 3, page: 1, size: 2 });
    expect(pagina.items).toEqual([
      { reporteId: 7, pendientes: 2, ultimaDenunciaEn: new Date('2026-10-05T14:00:00.000Z') },
      { reporteId: 5, pendientes: 2, ultimaDenunciaEn: new Date('2026-10-05T14:00:00.000Z') },
    ]);
    expect(sentencias).toHaveLength(1);
    expect(sentencias[0]!.sql).toContain('JOIN reporte_saturacion r ON r.id = d.reporte_id AND r.estado <> :eliminado');
    expect(sentencias[0]!.replacements).toMatchObject({ eliminado: 'ELIMINADO', limite: 2, desde: 0 });
  });

  it('primera pagina vacia: total 0 sin contar aparte', async () => {
    const pagina = await new DenunciaDAOSequelize().listarReportesConPendientes({ page: 1, size: 20 });
    expect(pagina).toMatchObject({ total: 0, items: [] });
    expect(sentencias).toHaveLength(1);
  });

  it('una pagina mas alla del final cuenta aparte, con el mismo filtro de reportes vigentes', async () => {
    respuestas = [[], [{ total: 3 }]];
    const pagina = await new DenunciaDAOSequelize().listarReportesConPendientes({ page: 5, size: 2 });
    expect(pagina).toMatchObject({ total: 3, items: [] });
    expect(sentencias).toHaveLength(2);
    expect(sentencias[1]!.sql).toMatch(/^SELECT COUNT\(DISTINCT d\.reporte_id\)::int AS total FROM denuncia d JOIN reporte_saturacion r/);
    expect(sentencias[1]!.replacements).toMatchObject({ eliminado: 'ELIMINADO' });
  });

  it('si el conteo aparte no trae fila el total es 0', async () => {
    respuestas = [[], []];
    expect(await new DenunciaDAOSequelize().listarReportesConPendientes({ page: 3, size: 2 })).toMatchObject({ total: 0 });
  });
});

describe('ContextoReporteDAOSequelize', () => {
  it('sin ids no consulta', async () => {
    const findAll = vi.spyOn(ReporteModel, 'findAll');
    expect(await new ContextoReporteDAOSequelize().buscarPorReportes([])).toEqual([]);
    expect(findAll).not.toHaveBeenCalled();
    expect(sentencias).toEqual([]);
  });
});
