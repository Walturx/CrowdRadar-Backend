/**
 * Reports and votes under concurrency since CRO-72 removed the per-user lock (`pg_advisory_xact_lock(usuarioId, 0)`) from
 * their transactions (opt-in: DATABASE_URL_TEST). Real PostgreSQL, full HTTP stack, real pool (DB_POOL_MAX 20,
 * DB_LOCK_TIMEOUT_MS default 5000). Checked: no 500/503 (deadlock, lock timeout), the per user and place cooldown, one vote
 * per user and report, the stored reliability, and that the points the API returns equal the CRO-72 rule recomputed here
 * from the stored rows. Kept from the independent verification of CRO-72. Request orders come from a seeded generator,
 * so a failing interleaving can be replayed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { URL_BD_TEST } from '../support/baseDatos.js';
import { crearEntornoPostgres, type EntornoPostgres } from '../support/entornoPostgres.js';

/** Deterministic pseudo-random numbers in [0, 1) (linear congruential generator) starting from `semilla`. */
function generador(semilla: number): () => number {
  let estado = semilla;
  return () => (estado = (estado * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

/** CRO-72 rule recomputed independently from the stored rows (defaults: min 3 votes, 10 for a state, ALTA 70, MEDIA 40). */
async function puntosSegunFilas(e: EntornoPostgres): Promise<Map<number, number>> {
  const reportes = await e.sql<{ id: number; usuario_id: number; estado: string }>('SELECT id, usuario_id, estado FROM reporte_saturacion');
  const votos = await e.sql<{ reporte_id: number; usuario_id: number; tipo_accion: string }>(
    'SELECT reporte_id, usuario_id, tipo_accion FROM validacion_reporte',
  );
  const usuarios = await e.sql<{ id: number }>('SELECT id FROM usuario');
  const estado = new Map<number, string | null>();
  for (const r of reportes) {
    const vs = votos.filter((v) => v.reporte_id === r.id);
    const c = vs.filter((v) => v.tipo_accion === 'CONFIRMAR').length;
    const n = vs.length;
    let s: string | null = null;
    if (r.estado === 'ACTIVO' && n >= 10) {
      const pct = Math.round((10000 * c) / n) / 100;
      s = pct >= 70 ? 'VALIDADO' : pct < 40 ? 'RECHAZADO' : null;
    }
    estado.set(r.id, s);
  }
  const puntos = new Map<number, number>(usuarios.map((u) => [u.id, 0]));
  for (const r of reportes) if (estado.get(r.id) === 'VALIDADO') puntos.set(r.usuario_id, puntos.get(r.usuario_id)! + 10);
  for (const v of votos) {
    const s = estado.get(v.reporte_id);
    if ((s === 'VALIDADO' && v.tipo_accion === 'CONFIRMAR') || (s === 'RECHAZADO' && v.tipo_accion === 'RECHAZAR')) {
      puntos.set(v.usuario_id, puntos.get(v.usuario_id)! + 2);
    }
  }
  return puntos;
}

const estados = (res: { status: number }[]) => res.map((r) => r.status).sort((a, b) => a - b);

describe.skipIf(!URL_BD_TEST)('reportes y votos concurrentes sin bloqueo por usuario (PostgreSQL real)', () => {
  let e: EntornoPostgres;
  const usuarios: number[] = [];
  let admin: number;

  beforeAll(async () => {
    e = await crearEntornoPostgres();
    for (let i = 0; i < 40; i += 1) usuarios.push(await e.usuario());
    admin = await e.usuario({ rol: 'ADMIN' });
  });

  afterAll(async () => {
    await e?.cerrar();
  });

  it('un usuario, 20 POST /api/reportes simultaneos en 20 lugares: 20 x 201, 20 filas, sin 500/503', async () => {
    const u = usuarios[0]!;
    const lugares: number[] = [];
    for (let i = 0; i < 20; i += 1) lugares.push(await e.lugar());
    const res = await Promise.all(lugares.map((l) => e.post(u, '/api/reportes', { lugarId: l, nivel: 'SATURADO' })));
    expect(estados(res)).toEqual(Array(20).fill(201));
    const [{ n }] = (await e.sql<{ n: string }>('SELECT count(*) AS n FROM reporte_saturacion WHERE usuario_id = $1', [u])) as [{ n: string }];
    expect(Number(n)).toBe(20);
  });

  it('un usuario, 12 POST simultaneos en el MISMO lugar: exactamente 1 x 201 y 11 x 422 REPORTE_EN_ESPERA, 1 fila', async () => {
    const u = usuarios[1]!;
    const lugar = await e.lugar();
    const res = await Promise.all(Array.from({ length: 12 }, () => e.post(u, '/api/reportes', { lugarId: lugar, nivel: 'MODERADO' })));
    expect(estados(res)).toEqual([201, ...Array(11).fill(422)]);
    for (const r of res.filter((x) => x.status === 422)) expect(r.body.code).toBe('REPORTE_EN_ESPERA');
    const filas = await e.sql('SELECT id FROM reporte_saturacion WHERE usuario_id = $1 AND lugar_id = $2', [u, lugar]);
    expect(filas).toHaveLength(1);
  });

  it('un usuario, 6 lugares x 4 POST simultaneos mezclados (+ otros 6 usuarios en los mismos lugares): uno por (usuario, lugar)', async () => {
    const u = usuarios[2]!;
    const lugares: number[] = [];
    for (let i = 0; i < 6; i += 1) lugares.push(await e.lugar());
    const azar = generador(3);
    const pedidos = [
      ...lugares.flatMap((l) => Array.from({ length: 4 }, () => () => e.post(u, '/api/reportes', { lugarId: l, nivel: 'SATURADO' }))),
      ...lugares.map((l, i) => () => e.post(usuarios[3 + i]!, '/api/reportes', { lugarId: l, nivel: 'TRANQUILO' })),
    ].sort(() => azar() - 0.5);
    const res = await Promise.all(pedidos.map((p) => p()));
    expect(res.filter((r) => r.status === 201)).toHaveLength(12);
    expect(res.filter((r) => r.status === 422)).toHaveLength(18);
    expect(res.filter((r) => r.status >= 500)).toHaveLength(0);
    const porPar = await e.sql<{ usuario_id: number; lugar_id: number; n: string }>(
      `SELECT usuario_id, lugar_id, count(*) AS n FROM reporte_saturacion WHERE lugar_id = ANY($1) GROUP BY 1, 2`,
      [lugares],
    );
    expect(porPar).toHaveLength(12);
    for (const fila of porPar) expect(Number(fila.n)).toBe(1);
  });

  it('un usuario vota 30 reportes distintos a la vez: 30 x 201; y 10 votos duplicados simultaneos: 1 x 201 + 9 x 409, 1 fila', async () => {
    const votante = usuarios[10]!;
    const autor = usuarios[11]!;
    const reportes: number[] = [];
    const lugar = await e.lugar();
    for (let i = 0; i < 30; i += 1) reportes.push(await e.reporteSql(autor, lugar));
    const res = await Promise.all(reportes.map((r) => e.post(votante, `/api/reportes/${r}/validaciones`, { tipoAccion: 'CONFIRMAR' })));
    expect(estados(res)).toEqual(Array(30).fill(201));
    const dup = await e.reporteSql(autor, lugar);
    const resDup = await Promise.all(
      Array.from({ length: 10 }, (_, i) => e.post(votante, `/api/reportes/${dup}/validaciones`, { tipoAccion: i % 2 ? 'RECHAZAR' : 'CONFIRMAR' })),
    );
    expect(estados(resDup)).toEqual([201, ...Array(9).fill(409)]);
    for (const r of resDup.filter((x) => x.status === 409)) expect(r.body.code).toBe('VALIDACION_DUPLICADA');
    expect(await e.sql('SELECT id FROM validacion_reporte WHERE reporte_id = $1 AND usuario_id = $2', [dup, votante])).toHaveLength(1);
  });

  it('25 usuarios votan un reporte a la vez mientras el autor lee sus puntos: confiabilidad guardada = filas, lecturas en {0,10}, final = regla', async () => {
    const autor = usuarios[12]!;
    const lugar = await e.lugar();
    const rep = (await e.post(autor, '/api/reportes', { lugarId: lugar, nivel: 'MODERADO' })).body.data.reporte.id as number;
    const votantes = usuarios.slice(13, 38);
    const votos = votantes.map((v, i) => () => e.post(v, `/api/reportes/${rep}/validaciones`, { tipoAccion: i < 20 ? 'CONFIRMAR' : 'RECHAZAR' }));
    const lecturas = Array.from({ length: 25 }, () => () => e.get(autor, '/api/users/profile'));
    const azar = generador(5);
    const res = await Promise.all([...votos, ...lecturas].sort(() => azar() - 0.5).map((p) => p()));
    expect(res.filter((r) => r.status >= 500)).toHaveLength(0);
    const leidos = res.filter((r) => r.body?.data?.user).map((r) => r.body.data.user.puntos as number);
    expect(leidos).toHaveLength(25);
    for (const p of leidos) expect([0, 10]).toContain(p);
    const [fila] = await e.sql<{ nivel_confiabilidad: string }>('SELECT nivel_confiabilidad FROM reporte_saturacion WHERE id = $1', [rep]);
    expect(Number(fila!.nivel_confiabilidad)).toBe(80); // 20 of 25
    const esperado = await puntosSegunFilas(e);
    expect((await e.get(autor, '/api/users/profile')).body.data.user.puntos).toBe(esperado.get(autor));
  });

  it('caos mezclado: reportes, votos cruzados, duplicados, moderacion y lecturas a la vez; sin 500/503 y puntos = regla para todos', async () => {
    const lugares: number[] = [];
    for (let i = 0; i < 8; i += 1) lugares.push(await e.lugar());
    // seed: every user has 1 report on the shared places (~12 votes each below, so many reach a final state)
    const reportes: { id: number; autor: number }[] = [];
    for (const [i, u] of usuarios.slice(0, 30).entries()) reportes.push({ id: await e.reporteSql(u, lugares[i % 8]!), autor: u });
    const victima = reportes[0]!;
    await e.post(usuarios[39]!, `/api/reportes/${victima.id}/denuncias`, { motivo: 'SPAM' });
    const pedidos: (() => Promise<{ status: number; body: { code?: string } }>)[] = [];
    const azar = generador(7);
    for (const u of usuarios.slice(0, 30)) {
      // each user votes 12 random reports of others (some twice: duplicates) and reports on 2 new places
      for (let k = 0; k < 12; k += 1) {
        const r = reportes[Math.floor(azar() * reportes.length)]!;
        if (r.autor === u) continue;
        const tipo = azar() < 0.75 ? 'CONFIRMAR' : 'RECHAZAR';
        pedidos.push(() => e.post(u, `/api/reportes/${r.id}/validaciones`, { tipoAccion: tipo }));
      }
      for (let k = 0; k < 2; k += 1) {
        const l = lugares[Math.floor(azar() * 8)]!;
        pedidos.push(() => e.post(u, '/api/reportes', { lugarId: l, nivel: azar() < 0.5 ? 'SATURADO' : 'TRANQUILO' }));
      }
      pedidos.push(() => e.get(u, '/api/users/profile'));
      pedidos.push(() => e.get(u, '/api/reportes/mios'));
    }
    pedidos.push(() => e.post(admin, `/api/admin/reportes-denunciados/${victima.id}/resolucion`, { decision: 'ELIMINAR' }));
    pedidos.push(() => e.get(admin, '/api/admin/usuarios?size=50'));
    const res = await Promise.all(pedidos.sort(() => azar() - 0.5).map((p) => p()));
    const inesperados = res.filter((r) => ![200, 201, 404, 409, 422].includes(r.status));
    expect(inesperados.map((r) => [r.status, r.body.code])).toEqual([]);
    // invariants on the stored rows
    const dups = await e.sql('SELECT reporte_id, usuario_id FROM validacion_reporte GROUP BY 1, 2 HAVING count(*) > 1');
    expect(dups).toEqual([]);
    const auto = await e.sql('SELECT v.id FROM validacion_reporte v JOIN reporte_saturacion r ON r.id = v.reporte_id WHERE r.usuario_id = v.usuario_id');
    expect(auto).toEqual([]);
    const conf = await e.sql<{ id: number; guardado: string | null; votos: string; c: string }>(
      `SELECT r.id, r.nivel_confiabilidad AS guardado, count(v.id) AS votos, count(v.id) FILTER (WHERE v.tipo_accion = 'CONFIRMAR') AS c
         FROM reporte_saturacion r LEFT JOIN validacion_reporte v ON v.reporte_id = r.id
        WHERE r.estado = 'ACTIVO' GROUP BY r.id HAVING count(v.id) >= 3`,
    );
    for (const f of conf) expect(Number(f.guardado), `reporte ${f.id}`).toBe(Math.round((10000 * Number(f.c)) / Number(f.votos)) / 100);
    const esperado = await puntosSegunFilas(e);
    const directorio = new Map<number, number>();
    for (let page = 1; page <= 3; page += 1) {
      const lista = await e.get(admin, `/api/admin/usuarios?size=50&page=${page}`);
      for (const item of lista.body.data.items) directorio.set(item.id, item.puntos);
    }
    for (const u of usuarios) {
      const perfil = (await e.get(u, '/api/users/profile')).body.data.user.puntos;
      expect(perfil, `perfil ${u}`).toBe(esperado.get(u));
      expect(directorio.get(u), `directorio ${u}`).toBe(esperado.get(u));
    }
    expect([...esperado.values()].some((p) => p > 0)).toBe(true);
  });
});
