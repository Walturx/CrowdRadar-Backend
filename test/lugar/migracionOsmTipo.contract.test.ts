/**
 * Migration 13 (lugar.osm_tipo, unique (osm_tipo, osm_id)) and the idempotent Lima seed against a real
 * PostgreSQL (opt-in: DATABASE_URL_TEST). Spec M2 D-3, S15.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  URL_BD_TEST,
  codigoDeError,
  consultar,
  crearBdTemporal,
  ejecutarCli,
  type BaseTemporal,
} from '../support/baseDatos.js';

const UNIQUE = '23505';
const CHECK = '23514';
const SEMILLA = '20261005100002-lugares-lima.cjs';

describe.skipIf(!URL_BD_TEST)('migracion 13: lugar.osm_tipo (PostgreSQL)', () => {
  let bd: BaseTemporal;
  const q = <T extends object = object>(sql: string, parametros: unknown[] = []) =>
    consultar(bd.url, sql, parametros) as Promise<T[]>;
  const insertar = (osmTipo: string | null, osmId: number) =>
    codigoDeError(
      bd.url,
      `INSERT INTO lugar (osm_id, ${osmTipo ? 'osm_tipo,' : ''} nombre, latitud, longitud, categoria)
       VALUES ($1, ${osmTipo ? `'${osmTipo}',` : ''} 'L', -12.1, -77.0, 'PARQUE')`,
      [osmId],
    );

  beforeAll(async () => {
    bd = await crearBdTemporal(URL_BD_TEST as string);
    const resultado = await ejecutarCli(['db:migrate'], bd.url);
    if (resultado.codigo !== 0) throw new Error(resultado.salida);
  });
  afterAll(async () => {
    await bd?.eliminar();
  });

  it('osm_tipo es NOT NULL con default node y solo admite node, way o relation', async () => {
    expect(await insertar(null, 1)).toBeUndefined();
    const [fila] = await q<{ osm_tipo: string }>('SELECT osm_tipo FROM lugar WHERE osm_id = 1');
    expect(fila?.osm_tipo).toBe('node');
    expect(await insertar('area', 2)).toBe(CHECK);
  });

  it('rechaza el par (osm_tipo, osm_id) repetido y admite el mismo osm_id con otro tipo', async () => {
    expect(await insertar('way', 10)).toBeUndefined();
    expect(await insertar('way', 10)).toBe(UNIQUE);
    expect(await insertar('relation', 10)).toBeUndefined();
  });

  it('el indice uq_lugar_osm reemplaza a uq_lugar_osm_id', async () => {
    const indices = (await q<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE tablename = 'lugar'")).map((i) => i.indexname);
    expect(indices).toContain('uq_lugar_osm');
    expect(indices).not.toContain('uq_lugar_osm_id');
  });

  it('el seeder es idempotente: dos corridas dejan 45 lugares sin saturacion', async () => {
    await q('DELETE FROM lugar');
    for (let corrida = 0; corrida < 2; corrida += 1) {
      const resultado = await ejecutarCli(['db:seed', '--seed', SEMILLA], bd.url);
      expect(resultado.codigo, resultado.salida).toBe(0);
    }
    const [conteo] = await q<{ total: string; sin_saturacion: string }>(
      'SELECT count(*) AS total, count(*) FILTER (WHERE saturacion_actual IS NULL) AS sin_saturacion FROM lugar',
    );
    expect(conteo).toEqual({ total: '45', sin_saturacion: '45' });
  });

  it('db:migrate:undo revierte la migracion 13 y db:migrate la vuelve a aplicar', async () => {
    await q('DELETE FROM lugar');
    const deshacer = await ejecutarCli(['db:migrate:undo'], bd.url);
    expect(deshacer.codigo, deshacer.salida).toBe(0);
    const columnas = await q<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'lugar'");
    expect(columnas.map((c) => c.column_name)).not.toContain('osm_tipo');
    expect(await insertar(null, 99)).toBeUndefined();
    expect(await insertar(null, 99)).toBe(UNIQUE);
    await q('DELETE FROM lugar');
    const aplicar = await ejecutarCli(['db:migrate'], bd.url);
    expect(aplicar.codigo, aplicar.salida).toBe(0);
    expect(await insertar('way', 99)).toBeUndefined();
  });
});
