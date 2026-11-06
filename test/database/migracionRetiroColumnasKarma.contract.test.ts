/**
 * Migration 15 drops the five point columns CRO-72 stopped using (`usuario.puntos_karma`,
 * `reporte_saturacion.puntos_otorgados` and `motivo_sin_puntos`, `validacion_reporte.karma_votante` and `puntos_otorgados`)
 * with their CHECKs, against a real PostgreSQL (opt-in: DATABASE_URL_TEST). Spec S22 (CRO-72, decision of 06/11/2026).
 *
 * The database stops at migration 14, gets the seeders plus rows that use every dropped column with non-default values,
 * and then goes up, down and up again through sequelize-cli, as a deploy and a rollback would.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { URL_BD_TEST, codigoDeError, consultar, crearBdTemporal, ejecutarCli, type BaseTemporal } from '../support/baseDatos.js';

const CHECK = '23514';
const NOT_NULL = '23502';
const MIGRACION_14 = '20261018000014-usuario-indice-sintetico.cjs';
const MIGRACION_15 = '20261106000015-retirar-columnas-karma.cjs';

/** The columns migration 15 drops, per table. */
const RETIRADAS: Record<string, string[]> = {
  usuario: ['puntos_karma'],
  reporte_saturacion: ['puntos_otorgados', 'motivo_sin_puntos'],
  validacion_reporte: ['karma_votante', 'puntos_otorgados'],
};
const TABLAS_AFECTADAS = Object.keys(RETIRADAS);
const CHECKS_RETIRADOS = [
  'ck_reporte_motivo_sin_puntos',
  'ck_reporte_puntos',
  'ck_usuario_puntos_karma',
  'ck_validacion_karma',
  'ck_validacion_puntos',
];
const TABLAS_APP = [
  'alerta',
  'denuncia',
  'dispositivo_push',
  'lugar',
  'lugar_favorito',
  'reporte_saturacion',
  'sancion_usuario',
  'token_recuperacion',
  'usuario',
  'validacion_reporte',
];
const ADMIN = { ADMIN_EMAIL: 'admin@crowdradar.test', ADMIN_PASSWORD: 'ClaveAdmin123', BCRYPT_COSTO: '4', SEED_SINTETICO: 'true' };

interface Columna {
  table_name: string;
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  is_nullable: string;
  column_default: string | null;
}
interface Restriccion {
  tabla: string;
  conname: string;
  definicion: string;
}
interface Indice {
  tablename: string;
  indexname: string;
  indexdef: string;
}
interface Esquema {
  columnas: Columna[];
  restricciones: Restriccion[];
  indices: Indice[];
}
type Huellas = Record<string, { filas: number; md5: string }>;

describe.skipIf(!URL_BD_TEST)('migracion 15: retiro de las columnas de karma y puntos (PostgreSQL)', () => {
  let bd: BaseTemporal;
  let antes: Esquema;
  let huellasAntes: Huellas;
  const q = <T extends object = Record<string, unknown>>(sql: string, parametros: unknown[] = []) =>
    consultar(bd.url, sql, parametros) as Promise<T[]>;

  /**
   * Columns (type, length, precision, nullability, default), constraints and indexes of the three tables, by name. The
   * ordinal position is left out on purpose: `down` appends the columns at the end of each table.
   */
  async function esquema(): Promise<Esquema> {
    const columnas = await q<Columna>(
      `SELECT table_name, column_name, data_type, character_maximum_length, numeric_precision, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1)
        ORDER BY table_name, column_name`,
      [TABLAS_AFECTADAS],
    );
    const restricciones = await q<Restriccion>(
      `SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS definicion
         FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace AND conrelid::regclass::text = ANY($1)
          AND contype <> 'n' -- PostgreSQL 18 lists NOT NULL here too; information_schema already covers it
        ORDER BY 1, 2`,
      [TABLAS_AFECTADAS],
    );
    const indices = await q<Indice>(
      "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1) ORDER BY 1, 2",
      [TABLAS_AFECTADAS],
    );
    return { columnas, restricciones, indices };
  }

  /** Row count and an md5 of every row without the dropped columns, per application table (jsonb prints sorted keys). */
  async function huellas(): Promise<Huellas> {
    const salida: Huellas = {};
    for (const tabla of TABLAS_APP) {
      const [fila] = await q<{ filas: number; md5: string }>(
        `SELECT count(*)::int AS filas,
                md5(coalesce(string_agg((to_jsonb(t) - $1::text[])::text, '|' ORDER BY t.id), '')) AS md5
           FROM ${tabla} t`,
        [RETIRADAS[tabla] ?? []],
      );
      salida[tabla] = fila as { filas: number; md5: string };
    }
    return salida;
  }

  const columnasRetiradasPresentes = async () =>
    (await esquema()).columnas
      .filter((c) => RETIRADAS[c.table_name]?.includes(c.column_name))
      .map((c) => `${c.table_name}.${c.column_name}`)
      .sort();
  const migracionesAplicadas = async () =>
    (await q<{ name: string }>('SELECT name FROM "SequelizeMeta" ORDER BY name')).map((f) => f.name);

  beforeAll(async () => {
    bd = await crearBdTemporal(URL_BD_TEST as string);
    const migrar = await ejecutarCli(['db:migrate', '--to', MIGRACION_14], bd.url);
    if (migrar.codigo !== 0) throw new Error(migrar.salida);
    const sembrar = await ejecutarCli(['db:seed:all'], bd.url, ADMIN);
    if (sembrar.codigo !== 0) throw new Error(sembrar.salida);

    // Rows that use every dropped column with values other than its default, written the way the karma code did.
    const [admin] = await q<{ id: number }>('SELECT id FROM usuario WHERE email = $1', [ADMIN.ADMIN_EMAIL]);
    const [autor] = await q<{ id: number }>(
      "INSERT INTO usuario (nombre, apellido, email, puntos_karma, distrito) VALUES ('Ana', 'Perez', 'ana@crowdradar.pe', 37, 'Miraflores') RETURNING id",
    );
    const [lugar] = await q<{ id: number }>('SELECT id FROM lugar ORDER BY id LIMIT 1');
    const [premiado] = await q<{ id: number }>(
      `INSERT INTO reporte_saturacion (usuario_id, lugar_id, nivel_saturacion, nivel_confiabilidad, puntos_otorgados)
       VALUES ($1, $2, 'SATURADO', 66.67, 10) RETURNING id`,
      [autor?.id, lugar?.id],
    );
    await q(
      `INSERT INTO reporte_saturacion (usuario_id, lugar_id, nivel_saturacion, estado, motivo_sin_puntos)
       VALUES ($1, $2, 'TRANQUILO', 'ELIMINADO', 'REPORTE_ELIMINADO'), ($1, $2, 'MODERADO', 'ACTIVO', 'TOPE_DIARIO')`,
      [autor?.id, lugar?.id],
    );
    const sinteticos = await q<{ id: number }>("SELECT id FROM usuario WHERE email LIKE '%@sintetico.crowdradar.local' ORDER BY id");
    for (const [i, votante] of [admin, ...sinteticos].entries()) {
      await q(
        `INSERT INTO validacion_reporte (reporte_id, usuario_id, tipo_accion, karma_votante, puntos_otorgados)
         VALUES ($1, $2, $3, $4, $5)`,
        [premiado?.id, votante?.id, i % 2 === 0 ? 'CONFIRMAR' : 'RECHAZAR', 15 * (i + 1), i % 2 === 0 ? 2 : 0],
      );
    }
    await q("INSERT INTO denuncia (reporte_id, usuario_id, motivo) VALUES ($1, $2, 'SPAM')", [premiado?.id, admin?.id]);
    await q('INSERT INTO lugar_favorito (usuario_id, lugar_id) VALUES ($1, $2)', [autor?.id, lugar?.id]);

    antes = await esquema();
    huellasAntes = await huellas();
  });

  afterAll(async () => {
    await bd?.eliminar();
  });

  it('en la migracion 14 las cinco columnas y sus CHECK existen y tienen datos (punto de partida)', async () => {
    expect(await migracionesAplicadas()).not.toContain(MIGRACION_15);
    expect(await columnasRetiradasPresentes()).toEqual([
      'reporte_saturacion.motivo_sin_puntos',
      'reporte_saturacion.puntos_otorgados',
      'usuario.puntos_karma',
      'validacion_reporte.karma_votante',
      'validacion_reporte.puntos_otorgados',
    ]);
    expect(antes.restricciones.map((r) => r.conname).filter((n) => CHECKS_RETIRADOS.includes(n)).sort()).toEqual(CHECKS_RETIRADOS);
    const [usados] = await q<{ karma: number; reportes: number; motivos: number; votos: number }>(
      `SELECT (SELECT count(*)::int FROM usuario WHERE puntos_karma > 0) AS karma,
              (SELECT count(*)::int FROM reporte_saturacion WHERE puntos_otorgados > 0) AS reportes,
              (SELECT count(*)::int FROM reporte_saturacion WHERE motivo_sin_puntos IS NOT NULL) AS motivos,
              (SELECT count(*)::int FROM validacion_reporte WHERE karma_votante > 0 AND puntos_otorgados > 0) AS votos`,
    );
    expect(usados).toEqual({ karma: 1, reportes: 1, motivos: 2, votos: 2 });
    expect(huellasAntes.reporte_saturacion?.filas).toBeGreaterThan(5000);
    expect(huellasAntes.validacion_reporte?.filas).toBe(4);
  });

  it('up corre en una sola transaccion: si una columna no se puede borrar, no borra ninguna ni se registra', async () => {
    // The last table it touches; a dependent view makes DROP COLUMN fail (no CASCADE: nothing else is dropped silently).
    await q('CREATE VIEW v_dependencia_prueba AS SELECT karma_votante FROM validacion_reporte');
    const migrar = await ejecutarCli(['db:migrate'], bd.url);
    expect(migrar.codigo).not.toBe(0);
    expect(migrar.salida).toMatch(/karma_votante/);
    await q('DROP VIEW v_dependencia_prueba');
    expect(await esquema()).toEqual(antes);
    expect(await migracionesAplicadas()).not.toContain(MIGRACION_15);
  });

  it('up borra las cinco columnas y sus cinco CHECK, y nada mas del esquema', async () => {
    const migrar = await ejecutarCli(['db:migrate'], bd.url);
    expect(migrar.codigo, migrar.salida).toBe(0);
    expect((await migracionesAplicadas()).at(-1)).toBe(MIGRACION_15);

    const despues = await esquema();
    expect(await columnasRetiradasPresentes()).toEqual([]);
    expect(despues.columnas).toEqual(antes.columnas.filter((c) => !RETIRADAS[c.table_name]?.includes(c.column_name)));
    expect(despues.restricciones).toEqual(antes.restricciones.filter((r) => !CHECKS_RETIRADOS.includes(r.conname)));
    expect(despues.indices).toEqual(antes.indices);
  });

  it('up conserva cada fila y cada valor de las demas columnas de las diez tablas', async () => {
    expect(await huellas()).toEqual(huellasAntes);
  });

  it('down restaura las columnas con su tipo, default, NOT NULL y CHECK originales, sin los datos', async () => {
    const deshacer = await ejecutarCli(['db:migrate:undo'], bd.url);
    expect(deshacer.codigo, deshacer.salida).toBe(0);
    expect(await migracionesAplicadas()).not.toContain(MIGRACION_15);
    expect(await esquema()).toEqual(antes);
    expect(await huellas()).toEqual(huellasAntes);

    // The shape comes back, the values do not: every row holds the neutral value.
    const [valores] = await q<{ karma: number; reportes: number; motivos: number; votos: number }>(
      `SELECT (SELECT count(*)::int FROM usuario WHERE puntos_karma <> 0) AS karma,
              (SELECT count(*)::int FROM reporte_saturacion WHERE puntos_otorgados <> 0) AS reportes,
              (SELECT count(*)::int FROM reporte_saturacion WHERE motivo_sin_puntos IS NOT NULL) AS motivos,
              (SELECT count(*)::int FROM validacion_reporte WHERE karma_votante <> 0 OR puntos_otorgados <> 0) AS votos`,
    );
    expect(valores).toEqual({ karma: 0, reportes: 0, motivos: 0, votos: 0 });

    // The restored constraints are enforced again, karma_votante without a default as in migration 04.
    const [{ id: reporte } = { id: 0 }] = await q<{ id: number }>('SELECT id FROM reporte_saturacion ORDER BY id LIMIT 1');
    const [{ id: votante } = { id: 0 }] = await q<{ id: number }>("SELECT id FROM usuario WHERE email = 'ana@crowdradar.pe'");
    expect(await codigoDeError(bd.url, "INSERT INTO usuario (nombre, apellido, email, puntos_karma) VALUES ('N', 'A', 'neg@crowdradar.pe', -1)")).toBe(CHECK);
    expect(await codigoDeError(bd.url, "UPDATE reporte_saturacion SET motivo_sin_puntos = 'OTRO' WHERE id = $1", [reporte])).toBe(CHECK);
    expect(await codigoDeError(bd.url, 'UPDATE reporte_saturacion SET puntos_otorgados = -1 WHERE id = $1', [reporte])).toBe(CHECK);
    const votar = (extra: string, valores: string) =>
      codigoDeError(
        bd.url,
        `INSERT INTO validacion_reporte (reporte_id, usuario_id, tipo_accion${extra}) VALUES ($1, $2, 'CONFIRMAR'${valores})`,
        [reporte, votante],
      );
    expect(await votar('', '')).toBe(NOT_NULL);
    expect(await votar(', karma_votante', ', -1')).toBe(CHECK);
    expect(await votar(', karma_votante, puntos_otorgados', ', 0, -1')).toBe(CHECK);
  });

  it('up otra vez (up/down/up) las vuelve a borrar sin tocar lo demas', async () => {
    const migrar = await ejecutarCli(['db:migrate'], bd.url);
    expect(migrar.codigo, migrar.salida).toBe(0);
    expect(await columnasRetiradasPresentes()).toEqual([]);
    expect((await esquema()).restricciones.map((r) => r.conname).filter((n) => CHECKS_RETIRADOS.includes(n))).toEqual([]);
    expect(await huellas()).toEqual(huellasAntes);
  });
});
