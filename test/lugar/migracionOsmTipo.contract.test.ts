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
// Undone by name: later migrations (14+) stay applied, so the test does not depend on 13 being the last one.
const MIGRACION_13 = '20261005000013-lugar-osm-tipo.cjs';

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

  it('db:migrate:undo --name revierte la migracion 13 y db:migrate la vuelve a aplicar', async () => {
    await q('DELETE FROM lugar');
    const deshacer = await ejecutarCli(['db:migrate:undo', '--name', MIGRACION_13], bd.url);
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

const ULTIMA_ANTERIOR = '20261005000012-usuario-password-cambiada-en.cjs';
/** The six places the C0 seeder created (osm_id only), with the type OpenStreetMap really gives them. */
const LEGADOS: readonly { osmId: number; osmTipo: string }[] = [
  { osmId: 3570374, osmTipo: 'relation' },
  { osmId: 28993402, osmTipo: 'way' },
  { osmId: 44364378, osmTipo: 'way' },
  { osmId: 396258998, osmTipo: 'way' },
  { osmId: 4119559799, osmTipo: 'node' },
  { osmId: 1418823155, osmTipo: 'node' },
];

describe.skipIf(!URL_BD_TEST)('migracion 13 sobre una base con los 6 lugares de C0 (PostgreSQL)', () => {
  let bd: BaseTemporal;
  const q = <T extends object = object>(sql: string, parametros: unknown[] = []) =>
    consultar(bd.url, sql, parametros) as Promise<T[]>;

  /** Inserts the legacy rows the way the C0 seeder did, plus a favorito and a reporte pointing at the first one. */
  async function sembrarLegado(conTipo: boolean) {
    await q('DELETE FROM lugar_favorito');
    await q('DELETE FROM reporte_saturacion');
    await q('DELETE FROM lugar');
    for (const { osmId } of LEGADOS) {
      await q(
        `INSERT INTO lugar (osm_id, ${conTipo ? 'osm_tipo,' : ''} nombre, latitud, longitud, categoria, saturacion_actual, saturacion_actualizada_en)
         VALUES ($1, ${conTipo ? "'node'," : ''} 'Viejo', -12.1, -77.0, 'PARQUE', 'SATURADO', now())`,
        [osmId],
      );
    }
    await q("INSERT INTO usuario (nombre, apellido, email) VALUES ('A', 'B', 'a@b.pe') ON CONFLICT DO NOTHING");
    const [usuario] = await q<{ id: number }>("SELECT id FROM usuario WHERE email = 'a@b.pe'");
    const [lugar] = await q<{ id: number }>('SELECT id FROM lugar WHERE osm_id = 3570374');
    await q('INSERT INTO lugar_favorito (usuario_id, lugar_id) VALUES ($1, $2)', [usuario!.id, lugar!.id]);
    await q("INSERT INTO reporte_saturacion (usuario_id, lugar_id, nivel_saturacion) VALUES ($1, $2, 'SATURADO')", [usuario!.id, lugar!.id]);
    return lugar!.id;
  }

  async function verificarSembradoSinDuplicados(idOlivar: number) {
    const [conteo] = await q<{ total: string }>('SELECT count(*) AS total FROM lugar');
    expect(conteo?.total).toBe('45');
    const [olivar] = await q<{ id: number; osm_tipo: string; nombre: string; saturacion_actual: string }>(
      'SELECT id, osm_tipo, nombre, saturacion_actual FROM lugar WHERE osm_id = 3570374',
    );
    expect(olivar).toMatchObject({ id: idOlivar, osm_tipo: 'relation', nombre: 'Parque El Olivar', saturacion_actual: 'SATURADO' });
    const [fks] = await q<{ favoritos: string; reportes: string }>(
      `SELECT (SELECT count(*) FROM lugar_favorito WHERE lugar_id = ${idOlivar}) AS favoritos,
              (SELECT count(*) FROM reporte_saturacion WHERE lugar_id = ${idOlivar}) AS reportes`,
    );
    expect(fks).toEqual({ favoritos: '1', reportes: '1' });
    const duplicados = await q('SELECT osm_id FROM lugar GROUP BY osm_id HAVING count(*) > 1');
    expect(duplicados).toEqual([]);
  }

  beforeAll(async () => {
    bd = await crearBdTemporal(URL_BD_TEST as string);
    const resultado = await ejecutarCli(['db:migrate', '--to', ULTIMA_ANTERIOR], bd.url);
    if (resultado.codigo !== 0) throw new Error(resultado.salida);
  });
  afterAll(async () => {
    await bd?.eliminar();
  });

  it('la migracion asigna el tipo real a los 6 lugares de C0 y el seeder deja exactamente 45, con sus FKs', async () => {
    const idOlivar = await sembrarLegado(false);
    const migrar = await ejecutarCli(['db:migrate'], bd.url);
    expect(migrar.codigo, migrar.salida).toBe(0);
    const tipos = await q<{ osm_id: string; osm_tipo: string }>('SELECT osm_id, osm_tipo FROM lugar ORDER BY osm_id');
    const porId = Object.fromEntries(tipos.map((t) => [Number(t.osm_id), t.osm_tipo]));
    for (const { osmId, osmTipo } of LEGADOS) expect(porId[osmId], String(osmId)).toBe(osmTipo);
    const sembrar = await ejecutarCli(['db:seed', '--seed', SEMILLA], bd.url);
    expect(sembrar.codigo, sembrar.salida).toBe(0);
    await verificarSembradoSinDuplicados(idOlivar);
  });

  it('el seeder reconcilia filas ya migradas con el default node en vez de duplicarlas', async () => {
    const idOlivar = await sembrarLegado(true);
    const sembrar = await ejecutarCli(['db:seed', '--seed', SEMILLA], bd.url);
    expect(sembrar.codigo, sembrar.salida).toBe(0);
    await verificarSembradoSinDuplicados(idOlivar);
  });

  it('el seeder no reconcilia cuando el par (tipo, osm_id) del JSON ya existe', async () => {
    await q('DELETE FROM lugar_favorito');
    await q('DELETE FROM reporte_saturacion');
    await q('DELETE FROM lugar');
    await q("INSERT INTO lugar (osm_id, osm_tipo, nombre, latitud, longitud, categoria) VALUES (3570374, 'node', 'Otro', -12.1, -77.0, 'PARQUE')");
    await q("INSERT INTO lugar (osm_id, osm_tipo, nombre, latitud, longitud, categoria) VALUES (3570374, 'relation', 'Viejo', -12.1, -77.0, 'PARQUE')");
    const sembrar = await ejecutarCli(['db:seed', '--seed', SEMILLA], bd.url);
    expect(sembrar.codigo, sembrar.salida).toBe(0);
    const filas = await q<{ osm_tipo: string; nombre: string }>('SELECT osm_tipo, nombre FROM lugar WHERE osm_id = 3570374 ORDER BY osm_tipo');
    expect(filas).toEqual([
      { osm_tipo: 'node', nombre: 'Otro' },
      { osm_tipo: 'relation', nombre: 'Parque El Olivar' },
    ]);
  });

  it('db:migrate:undo --name de la 13 falla con un mensaje claro y la lista de osm_id repetidos si dos tipos comparten numero', async () => {
    await q('DELETE FROM lugar_favorito');
    await q('DELETE FROM reporte_saturacion');
    await q('DELETE FROM lugar');
    await q("INSERT INTO lugar (osm_id, osm_tipo, nombre, latitud, longitud, categoria) VALUES (777, 'node', 'N', -12.1, -77.0, 'PARQUE'), (777, 'way', 'W', -12.1, -77.0, 'PARQUE')");
    const deshacer = await ejecutarCli(['db:migrate:undo', '--name', MIGRACION_13], bd.url);
    expect(deshacer.codigo).not.toBe(0);
    expect(deshacer.salida).toContain('777');
    expect(deshacer.salida).toMatch(/osm_id/);
    expect(deshacer.salida).toMatch(/node.*way|way.*node/s);
    const columnas = await q<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'lugar'");
    expect(columnas.map((c) => c.column_name)).toContain('osm_tipo');
  });
});

